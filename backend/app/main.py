from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import Base, engine, get_db
from app.models import Project
from app.schemas import ProjectCreate, ProjectRead, UploadCompleteRequest, UploadUrlRead, UploadUrlRequest
from app.storage import create_video_upload_url, video_exists


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Convenient for the first local scaffold. Replace with Alembic migrations
    # before deploying the service.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Loopcut API",
    version="0.1.0",
    description="Project API for the Loopcut video clipping studio.",
    lifespan=lifespan,
)


@app.get("/api/v1/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is unavailable.",
        ) from exc
    return {"status": "ok", "database": "ok"}


@app.post("/api/v1/projects", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(
        title=payload.title,
        source_type=payload.source_type,
        source_url=str(payload.source_url) if payload.source_url else None,
        rights_confirmed=payload.rights_confirmed,
        caption_language=payload.caption_language,
        aspect_ratio=payload.aspect_ratio,
        min_clip_seconds=payload.min_clip_seconds,
        max_clip_seconds=payload.max_clip_seconds,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@app.get("/api/v1/projects", response_model=list[ProjectRead])
def list_projects(db: Session = Depends(get_db)):
    return list(db.scalars(select(Project).order_by(Project.created_at.desc())).all())


@app.get("/api/v1/projects/{project_id}", response_model=ProjectRead)
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


@app.post("/api/v1/projects/{project_id}/upload-url", response_model=UploadUrlRead)
def request_upload_url(project_id: str, payload: UploadUrlRequest, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    if not project.rights_confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirm that you own or have permission to process this video.",
        )
    try:
        object_key, upload_url = create_video_upload_url(
            project.id,
            payload.filename,
            payload.content_type,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Video storage is unavailable.",
        ) from exc

    project.source_type = "upload"
    project.source_key = object_key
    project.status = "upload_pending"
    db.commit()
    return UploadUrlRead(
        upload_url=upload_url,
        object_key=object_key,
        expires_in=900,
        required_headers={"Content-Type": payload.content_type},
    )


@app.post("/api/v1/projects/{project_id}/upload-complete", response_model=ProjectRead)
def confirm_upload(project_id: str, payload: UploadCompleteRequest, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    if payload.object_key != project.source_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload key does not match this project.")
    try:
        exists = video_exists(payload.object_key)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Video storage is unavailable.",
        ) from exc
    if not exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded video was not found in storage.")

    project.status = "ready"
    db.commit()
    db.refresh(project)
    return project

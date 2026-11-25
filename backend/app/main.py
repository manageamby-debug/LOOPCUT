from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.celery_app import render_video_export_task
from app.db import Base, engine, get_db
from app.config import settings
from app.models import Project, VideoExport
from app.rendering import render_video_export
from app.schemas import (
    ProjectCreate,
    ProjectRead,
    UploadCompleteRequest,
    UploadUrlRead,
    UploadUrlRequest,
    VideoExportCreate,
    VideoExportRead,
)
from app.storage import (
    create_video_download_url,
    create_video_upload_url,
    store_video_file,
    video_exists,
)


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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8088", "http://127.0.0.1:8088"],
    # Allow any localhost port (Live Server, http.server, etc.) during development.
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
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
    if payload.source_type == "url":
        project.status = "source_saved"
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


@app.post(
    "/api/v1/projects/{project_id}/exports",
    response_model=VideoExportRead,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_video_export(
    project_id: str,
    payload: VideoExportCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    if not project.rights_confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirm that you own or have permission to process this video.",
        )
    if project.source_type != "upload" or not project.source_key:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Upload the source video before exporting. Link-only projects do not have a video file to render.",
        )

    export = VideoExport(
        project_id=project.id,
        start_seconds=payload.start_seconds,
        end_seconds=payload.end_seconds,
        aspect_ratio=payload.aspect_ratio,
        status="queued",
        progress=0,
    )
    db.add(export)
    db.commit()
    db.refresh(export)
    try:
        if settings.app_env == "local":
            # No Redis/Celery worker without Docker: render inside the API process.
            background_tasks.add_task(render_video_export, export.id)
        else:
            render_video_export_task.delay(export.id)
    except Exception as exc:
        export.status = "failed"
        export.error_message = "The render queue is unavailable. Start the worker and try again."
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=export.error_message,
        ) from exc
    return export


@app.get(
    "/api/v1/projects/{project_id}/exports/{export_id}",
    response_model=VideoExportRead,
)
def get_video_export(project_id: str, export_id: str, request: Request, db: Session = Depends(get_db)):
    export = db.get(VideoExport, export_id)
    if export is None or export.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found.")
    response = VideoExportRead.model_validate(export)
    if export.status == "complete" and export.render_key:
        try:
            response.download_url = create_video_download_url(export.render_key)
            if response.download_url.startswith("/"):
                response.download_url = str(request.base_url).rstrip("/") + response.download_url
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The rendered video is ready, but its download link could not be created.",
            ) from exc
    return response


@app.get("/api/v1/downloads/{render_key:path}", include_in_schema=False)
def download_local_render(render_key: str):
    """Serve finished renders from disk (local, Docker-free mode only)."""
    if settings.app_env != "local":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
    renders_dir = (settings.local_media_dir / "renders").resolve()
    target = (settings.local_media_dir / render_key).resolve()
    if renders_dir not in target.parents or not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rendered video not found.")
    return FileResponse(target, media_type="video/mp4", filename="loopcut-clip.mp4")


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


@app.post("/api/v1/projects/{project_id}/upload", response_model=ProjectRead)
def upload_video_locally(
    project_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Accept a browser upload and save it locally or to S3-compatible storage."""
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    if not project.rights_confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirm that you own or have permission to process this video.",
        )
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Choose a video file.")

    safe_filename = Path(file.filename or "video.mp4").name.replace("..", "_")
    try:
        if settings.app_env == "local":
            settings.local_media_dir.mkdir(parents=True, exist_ok=True)
            object_name = f"{project.id}-{uuid4()}-{safe_filename}"
            destination = settings.local_media_dir / object_name
            with destination.open("wb") as output_file:
                while chunk := file.file.read(1024 * 1024):
                    output_file.write(chunk)
            project.source_key = str(destination.relative_to(settings.local_media_dir.parent.parent))
        else:
            project.source_key = store_video_file(
                project.id,
                safe_filename,
                file.content_type,
                file.file,
            )
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save the uploaded video.",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Video storage is unavailable.",
        ) from exc
    finally:
        file.file.close()

    project.source_type = "upload"
    project.status = "ready"
    if project.title == "Untitled video":
        project.title = Path(safe_filename).stem[:180] or project.title
    db.commit()
    db.refresh(project)
    return project

# Loopcut

Loopcut is an AI video clipping studio. This workspace contains the first browser UI prototype and the initial Python backend foundation.

## Workspace layout

- `frontend-prototype/` — reviewable browser prototype for the dashboard and clip editor
- `backend/` — FastAPI API, PostgreSQL models, and Celery worker setup
- `compose.yaml` — local frontend, API, PostgreSQL, Redis, storage, and worker services

## Start locally without Docker

Python 3.10 or newer is required. From PowerShell in this folder, run:

```powershell
.\scripts\setup.ps1
.\scripts\run-api.ps1
```

The setup script creates `.venv` and reuses Python packages already installed on this machine. It downloads the small local API dependency set only if anything is missing. The local API uses SQLite and saves uploaded videos under `backend/local_media`. Open `http://127.0.0.1:8000/docs` for the API page. Press Ctrl+C in the API window to stop it.

## Start the full service stack with Docker

`.env` is prefilled with local development settings. If it is missing, copy `.env.example` to `.env`, then run `docker compose up --build` from this folder. Open the Loopcut page at `http://localhost:8088` and the API docs at `http://localhost:8001/docs`. The stack uses PostgreSQL, Redis, and RustFS-compatible object storage; the storage console is at `http://localhost:9001`. Services bind to localhost.

The API saves link projects and stores uploaded video files. Uploaded files can be trimmed and cropped into MP4 exports by the FFmpeg worker. YouTube links can be previewed, but platform media import, transcription, automatic moment detection, and burned-in captions are not connected yet. Use a video file you own or are authorized to process.

## First API routes

- `GET /api/v1/health` — API and database health
- `POST /api/v1/projects` — create a project
- `GET /api/v1/projects` — list projects
- `GET /api/v1/projects/{project_id}` — read a project
- `POST /api/v1/projects/{project_id}/upload` — upload a video file (multipart field `file`); stored locally or in object storage based on environment
- `POST /api/v1/projects/{project_id}/upload-url` — request a short lived upload URL
- `POST /api/v1/projects/{project_id}/upload-complete` — confirm the stored file
- `POST /api/v1/projects/{project_id}/exports` — queue an MP4 trim/crop export
- `GET /api/v1/projects/{project_id}/exports/{export_id}` — read progress and receive a download URL when complete

For a link source, the API requires `rights_confirmed: true`. At this stage, link submission saves the source URL; it does not download the platform video. Browser uploads are stored in the S3-compatible service in Docker mode.

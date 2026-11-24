# Loopcut

Loopcut is an AI video clipping studio. This workspace contains the first browser UI prototype and the initial Python backend foundation.

## Workspace layout

- `frontend-prototype/` — reviewable browser prototype for the dashboard and clip editor
- `backend/` — FastAPI API, PostgreSQL models, and Celery worker setup
- `compose.yaml` — local PostgreSQL, Redis, API, and worker services

## Start locally without Docker

Python 3.10 or newer is required. From PowerShell in this folder, run:

```powershell
.\scripts\setup.ps1
.\scripts\run-api.ps1
```

The setup script creates `.venv` and reuses Python packages already installed on this machine. It downloads the small local API dependency set only if anything is missing. The local API uses SQLite and saves uploaded videos under `backend/local_media`; Redis workers and MinIO are available in Docker mode. Open `http://127.0.0.1:8000/docs` for the API page. Press Ctrl+C in the API window to stop it.

## Start the full service stack with Docker

`.env` is prefilled with local development settings. If it is missing, copy `.env.example` to `.env`, then run `docker compose up --build` from this folder. The full stack uses PostgreSQL, Redis, and MinIO. MinIO’s local console is at `http://localhost:9001`; its development credentials are in `.env.example`. Services bind to localhost.

The API creates project records and direct upload URLs. The worker and queue are configured; the media processing pipeline will be added in the next backend step.

## First API routes

- `GET /api/v1/health` — API and database health
- `POST /api/v1/projects` — create a project
- `GET /api/v1/projects` — list projects
- `GET /api/v1/projects/{project_id}` — read a project
- `POST /api/v1/projects/{project_id}/upload` — local development upload (multipart field `file`)
- `POST /api/v1/projects/{project_id}/upload-url` — request a short lived upload URL
- `POST /api/v1/projects/{project_id}/upload-complete` — confirm the stored file

For a link source, the API requires an explicit `rights_confirmed: true`. Platform retrieval is not implemented yet; source adapters will be added per platform. Browser uploads go straight to the S3-compatible store instead of passing video bytes through FastAPI.

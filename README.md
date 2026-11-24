# Loopcut

Loopcut is an AI video clipping studio. This workspace contains the first browser UI prototype and the initial Python backend foundation.

## Workspace layout

- `frontend-prototype/` — reviewable browser prototype for the dashboard and clip editor
- `backend/` — FastAPI API, PostgreSQL models, and Celery worker setup
- `compose.yaml` — local PostgreSQL, Redis, API, and worker services

## Start the backend locally

1. Install Docker Desktop if it is not already available.
2. `.env` is prefilled with local development settings. If it is missing, copy `.env.example` to `.env` in this folder.
3. From this folder, run `docker compose up --build`.
4. Open `http://localhost:8000/docs` for the API page.
5. MinIO’s local console is at `http://localhost:9001`; the development credentials are in `.env.example`.

The API creates project records and direct upload URLs. The worker and queue are configured; the media processing pipeline will be added in the next backend step. Services bind to localhost for local development.

## First API routes

- `GET /api/v1/health` — API and database health
- `POST /api/v1/projects` — create a project
- `GET /api/v1/projects` — list projects
- `GET /api/v1/projects/{project_id}` — read a project
- `POST /api/v1/projects/{project_id}/upload-url` — request a short lived upload URL
- `POST /api/v1/projects/{project_id}/upload-complete` — confirm the stored file

For a link source, the API requires an explicit `rights_confirmed: true`. Platform retrieval is not implemented yet; source adapters will be added per platform. Browser uploads go straight to the S3-compatible store instead of passing video bytes through FastAPI.

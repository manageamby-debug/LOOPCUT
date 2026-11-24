# Loopcut prototype

This is the first browser prototype for the AI clipping studio. It is a self-contained UI so the editing flow can be reviewed before wiring in the processing services.

## Open it

With the Docker stack running, open `http://localhost:8088`. The page is served by the local frontend container and connects to the API on port 8001.

## What works in this prototype

- Create a saved project from a link or upload a video file to object storage
- Local video preview after selecting and uploading a file
- YouTube embed preview for supported links
- Trim and aspect-ratio export through the FFmpeg worker
- Sample AI moment cards with switching previews and clip time ranges
- Aspect ratio controls, caption text and style controls, and editor tabs
- Responsive layout for desktop and mobile widths

Sample moment generation, platform media import, transcription, translated captions, and burned-in captions are not connected yet. Export currently trims a selected time range, crops to the chosen aspect ratio, and saves an MP4. A saved link is project metadata and an optional YouTube preview; upload a source file you own or are authorized to process for an export.

## Planned production stack

- Next.js and TypeScript web app
- Python FastAPI API
- PostgreSQL project data
- Celery workers with Redis queue
- S3-compatible video storage
- FFmpeg for media inspection and rendering

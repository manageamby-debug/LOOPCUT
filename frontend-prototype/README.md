# Loopcut prototype

This is the first browser prototype for the AI clipping studio. It is a self-contained UI so the editing flow can be reviewed before wiring in the processing services.

## Open it

Open `index.html` in a modern browser. No build step or package install is needed.

## What works in this prototype

- Overview screen with video link and upload entry points
- Local video preview after selecting a file
- Sample AI moment cards with switching previews and clip time ranges
- Aspect ratio controls, caption text and style controls, and editor tabs
- Responsive layout for desktop and mobile widths

The sample moment generation, translations, platform link processing, and final video export are interface previews. They need the API and worker pipeline before they can process real projects.

## Planned production stack

- Next.js and TypeScript web app
- Python FastAPI API
- PostgreSQL project data
- Celery workers with Redis queue
- S3-compatible video storage
- FFmpeg for media inspection and rendering

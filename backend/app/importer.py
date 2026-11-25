"""Download the video behind a project's link (YouTube etc.) so it can be clipped and exported."""
import logging
import mimetypes
import re
import shutil
import tempfile
from pathlib import Path
from uuid import uuid4

from app.config import settings
from app.db import SessionLocal
from app.models import ProcessingJob, Project
from app.storage import store_video_file

logger = logging.getLogger("loopcut.importer")

VIDEO_SUFFIXES = {".mp4", ".mkv", ".webm", ".mov", ".m4v"}
ANSI_PATTERN = re.compile(r"\x1b\[[0-9;]*m")


def _find_downloaded(work_dir: Path) -> Path:
    candidates = [p for p in work_dir.iterdir() if p.is_file() and p.suffix.lower() in VIDEO_SUFFIXES]
    if not candidates:
        raise RuntimeError("The download finished but no video file was produced.")
    return max(candidates, key=lambda p: p.stat().st_size)


def _friendly_error(exc: Exception) -> str:
    message = ANSI_PATTERN.sub("", str(exc)).strip() or exc.__class__.__name__
    if "ffmpeg" in message.lower() and "not found" in message.lower():
        message = "FFmpeg is not installed or not on PATH. Install FFmpeg and restart the API."
    return f"Could not import this link: {message}"[:500]


def import_source_video(job_id: str) -> None:
    db = SessionLocal()
    job = db.get(ProcessingJob, job_id)
    if job is None:
        db.close()
        return

    try:
        project = db.get(Project, job.project_id)
        if project is None or not project.source_url:
            raise ValueError("This project has no link to import.")
        try:
            from yt_dlp import YoutubeDL
        except ImportError as exc:
            raise RuntimeError("yt-dlp is not installed. Run: pip install -U yt-dlp") from exc

        job.status = "running"
        job.progress = 1
        job.error_message = None
        db.commit()

        with tempfile.TemporaryDirectory(prefix="loopcut-import-") as temp_dir:
            work_dir = Path(temp_dir)
            last_saved = {"progress": 1}

            def on_progress(info: dict) -> None:
                if info.get("status") != "downloading":
                    return
                total = info.get("total_bytes") or info.get("total_bytes_estimate")
                if not total:
                    return
                progress = min(90, 1 + int(info.get("downloaded_bytes", 0) / total * 89))
                if progress >= last_saved["progress"] + 3:
                    last_saved["progress"] = progress
                    job.progress = progress
                    db.commit()

            options = {
                # Prefer H.264 + AAC so the browser can preview the file; cap at 1080p.
                "format": (
                    "bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/"
                    "bv*[height<=1080]+ba/b[height<=1080]/b"
                ),
                "merge_output_format": "mp4",
                "outtmpl": str(work_dir / "source.%(ext)s"),
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,
                "progress_hooks": [on_progress],
            }
            if settings.ytdlp_cookies_from_browser:
                options["cookiesfrombrowser"] = (settings.ytdlp_cookies_from_browser,)

            with YoutubeDL(options) as downloader:
                info = downloader.extract_info(project.source_url, download=True)

            downloaded = _find_downloaded(work_dir)
            job.progress = 92
            db.commit()

            suffix = downloaded.suffix.lower()
            if settings.app_env == "local":
                settings.local_media_dir.mkdir(parents=True, exist_ok=True)
                destination = settings.local_media_dir / f"{project.id}-{uuid4()}-source{suffix}"
                shutil.copyfile(downloaded, destination)
                project.source_key = str(destination.relative_to(settings.local_media_dir.parent.parent))
            else:
                content_type = mimetypes.guess_type(downloaded.name)[0] or "video/mp4"
                with downloaded.open("rb") as handle:
                    project.source_key = store_video_file(project.id, f"source{suffix}", content_type, handle)

            title = (info or {}).get("title")
            if title and (project.title == "Untitled video" or project.title.endswith(" video")):
                project.title = str(title)[:180]
            project.status = "ready"
            job.status = "complete"
            job.progress = 100
            db.commit()
    except Exception as exc:
        logger.exception("Import %s failed", job_id)
        db.rollback()
        job.status = "failed"
        job.progress = 0
        job.error_message = _friendly_error(exc)
        failed_project = db.get(Project, job.project_id)
        if failed_project is not None:
            failed_project.status = "import_failed"
        db.commit()
    finally:
        db.close()

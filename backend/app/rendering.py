import logging
import subprocess
import tempfile
from pathlib import Path

from app.db import SessionLocal
from app.models import Project, VideoExport
from app.storage import download_video_file, store_rendered_video

logger = logging.getLogger("loopcut.rendering")


OUTPUT_SIZES = {
    "9:16": (1080, 1920),
    "4:5": (1080, 1350),
    "1:1": (1080, 1080),
    "16:9": (1920, 1080),
}


def render_video_export(export_id: str) -> None:
    db = SessionLocal()
    export = db.get(VideoExport, export_id)
    if export is None:
        db.close()
        return

    try:
        project = db.get(Project, export.project_id)
        if project is None or not project.source_key:
            raise ValueError("This project has no uploaded source video.")

        export.status = "rendering"
        export.progress = 5
        export.error_message = None
        db.commit()

        with tempfile.TemporaryDirectory(prefix="loopcut-export-") as temp_dir:
            work_dir = Path(temp_dir)
            source_suffix = Path(project.source_key).suffix or ".video"
            source_path = work_dir / f"source{source_suffix}"
            output_path = work_dir / "loopcut-clip.mp4"
            download_video_file(project.source_key, source_path)

            export.progress = 15
            db.commit()

            width, height = OUTPUT_SIZES[export.aspect_ratio]
            duration = export.end_seconds - export.start_seconds
            video_filter = (
                f"scale={width}:{height}:force_original_aspect_ratio=increase,"
                f"crop={width}:{height}"
            )
            command = [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                f"{export.start_seconds:.3f}",
                "-i",
                str(source_path),
                "-t",
                f"{duration:.3f}",
                "-vf",
                video_filter,
                "-map",
                "0:v:0",
                "-map",
                "0:a?",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "23",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-movflags",
                "+faststart",
                "-progress",
                "pipe:1",
                "-nostats",
                str(output_path),
            ]
            stderr_log = work_dir / "ffmpeg-error.log"
            stderr_handle = stderr_log.open("wb")
            try:
                process = subprocess.Popen(
                    command,
                    stdout=subprocess.PIPE,
                    stderr=stderr_handle,
                    text=True,
                )
            except FileNotFoundError as exc:
                stderr_handle.close()
                raise RuntimeError(
                    "FFmpeg is not installed or not on PATH. Install FFmpeg and restart the API."
                ) from exc
            last_saved_progress = 15
            assert process.stdout is not None
            for line in process.stdout:
                if not line.startswith("out_time_ms="):
                    continue
                try:
                    rendered_seconds = int(line.split("=", 1)[1].strip()) / 1_000_000
                except ValueError:
                    continue
                progress = min(88, 15 + int(rendered_seconds / duration * 73))
                if progress >= last_saved_progress + 5:
                    export.progress = progress
                    db.commit()
                    last_saved_progress = progress

            return_code = process.wait()
            stderr_handle.close()
            if return_code != 0 or not output_path.exists() or output_path.stat().st_size == 0:
                detail = stderr_log.read_text(errors="ignore").strip()[-300:]
                raise RuntimeError(f"FFmpeg could not render this source video. {detail}".strip())

            export.progress = 92
            db.commit()
            export.render_key = f"renders/{project.id}/{export.id}.mp4"
            store_rendered_video(export.render_key, output_path)
            export.status = "complete"
            export.progress = 100
            db.commit()
    except Exception as exc:
        logger.exception("Export %s failed", export_id)
        db.rollback()
        export.status = "failed"
        export.progress = 0
        export.error_message = f"Rendering failed: {exc}"[:500]
        db.commit()
    finally:
        db.close()

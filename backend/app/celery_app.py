from celery import Celery

from app.config import settings


celery_app = Celery(
    "loopcut",
    broker=settings.redis_url,
    backend=settings.redis_url,
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)


@celery_app.task(name="loopcut.worker_ping")
def worker_ping() -> str:
    """Small task used to confirm that the worker can reach Redis."""
    return "Loopcut worker is ready."


@celery_app.task(name="loopcut.import_source_video")
def import_source_video_task(job_id: str) -> None:
    from app.importer import import_source_video

    import_source_video(job_id)


@celery_app.task(name="loopcut.render_video_export")
def render_video_export_task(export_id: str) -> None:
    from app.rendering import render_video_export

    render_video_export(export_id)

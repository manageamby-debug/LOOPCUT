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

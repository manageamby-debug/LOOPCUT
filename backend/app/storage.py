import shutil
from pathlib import Path
from uuid import uuid4

from app.config import settings


def _is_local() -> bool:
    """Docker-free mode: files live on disk instead of S3-compatible storage."""
    return settings.app_env == "local"


def _local_root() -> Path:
    # Uploaded sources are saved with a key relative to the project root.
    return settings.local_media_dir.parent.parent


def _client(endpoint_url: str):
    import boto3
    from botocore.client import Config

    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name="us-east-1",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def _ensure_bucket() -> None:
    from botocore.exceptions import ClientError

    client = _client(settings.s3_internal_endpoint_url)
    try:
        client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code not in {"404", "NoSuchBucket", "NotFound"}:
            raise
        client.create_bucket(Bucket=settings.s3_bucket)


def create_video_upload_url(project_id: str, filename: str, content_type: str) -> tuple[str, str]:
    _ensure_bucket()
    safe_name = filename.replace("\\", "/").split("/")[-1]
    object_key = f"sources/{project_id}/{uuid4()}-{safe_name}"
    client = _client(settings.s3_public_endpoint_url)
    upload_url = client.generate_presigned_url(
        "put_object",
        Params={"Bucket": settings.s3_bucket, "Key": object_key, "ContentType": content_type},
        ExpiresIn=900,
    )
    return object_key, upload_url


def store_video_file(project_id: str, filename: str, content_type: str, fileobj) -> str:
    _ensure_bucket()
    safe_name = filename.replace("\\", "/").split("/")[-1]
    object_key = f"sources/{project_id}/{uuid4()}-{safe_name}"
    _client(settings.s3_internal_endpoint_url).upload_fileobj(
        fileobj,
        settings.s3_bucket,
        object_key,
        ExtraArgs={"ContentType": content_type},
    )
    return object_key


def download_video_file(object_key: str, destination) -> None:
    if _is_local():
        source = _local_root() / object_key
        if not source.is_file():
            raise FileNotFoundError(f"Source video not found on disk: {source}")
        shutil.copyfile(source, destination)
        return
    _client(settings.s3_internal_endpoint_url).download_file(
        settings.s3_bucket,
        object_key,
        str(destination),
    )


def store_rendered_video(object_key: str, source_path) -> None:
    if _is_local():
        target = settings.local_media_dir / object_key
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_path, target)
        return
    _client(settings.s3_internal_endpoint_url).upload_file(
        str(source_path),
        settings.s3_bucket,
        object_key,
        ExtraArgs={"ContentType": "video/mp4"},
    )


def create_video_download_url(object_key: str) -> str:
    if _is_local():
        # Served by the API itself (see /api/v1/downloads in main.py).
        return f"/api/v1/downloads/{object_key}"
    return _client(settings.s3_public_endpoint_url).generate_presigned_url(
        "get_object",
        Params={
            "Bucket": settings.s3_bucket,
            "Key": object_key,
            "ResponseContentDisposition": 'attachment; filename="loopcut-clip.mp4"',
        },
        ExpiresIn=900,
    )


def video_exists(object_key: str) -> bool:
    from botocore.exceptions import ClientError

    client = _client(settings.s3_internal_endpoint_url)
    try:
        client.head_object(Bucket=settings.s3_bucket, Key=object_key)
        return True
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise

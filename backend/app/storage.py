from uuid import uuid4

from app.config import settings


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

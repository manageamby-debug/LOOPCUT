from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    database_url: str = "postgresql+psycopg://loopcut:loopcut-local-only@localhost:5432/loopcut"
    redis_url: str = "redis://localhost:6379/0"
    s3_internal_endpoint_url: str = "http://localhost:9000"
    s3_public_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "loopcut-dev"
    s3_secret_key: str = "loopcut-dev-secret"
    s3_bucket: str = "loopcut-media"


settings = Settings()

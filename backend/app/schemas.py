from datetime import datetime
from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, model_validator


class ProjectCreate(BaseModel):
    title: str = Field(default="Untitled video", min_length=1, max_length=180)
    source_type: Literal["url", "upload"] = "url"
    source_url: AnyHttpUrl | None = None
    rights_confirmed: bool = False
    caption_language: str = Field(default="en", min_length=2, max_length=32)
    aspect_ratio: Literal["9:16", "4:5", "1:1", "16:9"] = "9:16"
    min_clip_seconds: int = Field(default=30, ge=10, le=180)
    max_clip_seconds: int = Field(default=60, ge=10, le=180)

    @model_validator(mode="after")
    def validate_source_and_duration(self):
        if self.source_type == "url" and self.source_url is None:
            raise ValueError("source_url is required when source_type is 'url'.")
        if self.source_type == "url" and not self.rights_confirmed:
            raise ValueError("Confirm that you own or have permission to process this video.")
        if self.min_clip_seconds > self.max_clip_seconds:
            raise ValueError("min_clip_seconds must be less than or equal to max_clip_seconds.")
        return self


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    source_type: str
    source_url: str | None
    rights_confirmed: bool
    caption_language: str
    aspect_ratio: str
    min_clip_seconds: int
    max_clip_seconds: int
    status: str
    created_at: datetime
    updated_at: datetime


class UploadUrlRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=240)
    content_type: str = Field(pattern=r"^video/[a-zA-Z0-9.+-]+$")


class UploadUrlRead(BaseModel):
    upload_url: str
    object_key: str
    expires_in: int
    required_headers: dict[str, str]


class UploadCompleteRequest(BaseModel):
    object_key: str = Field(min_length=1, max_length=700)


class VideoExportCreate(BaseModel):
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(gt=0, le=18000)
    aspect_ratio: Literal["9:16", "4:5", "1:1", "16:9"] = "9:16"

    @model_validator(mode="after")
    def validate_range(self):
        if self.end_seconds <= self.start_seconds:
            raise ValueError("end_seconds must be greater than start_seconds.")
        if self.end_seconds - self.start_seconds > 180:
            raise ValueError("A single export cannot exceed 180 seconds.")
        return self


class ImportJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
    progress: int
    error_message: str | None


class VideoExportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
    progress: int
    error_message: str | None
    download_url: str | None = None

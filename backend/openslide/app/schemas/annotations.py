from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import Any
import uuid


class AnnotationTarget(BaseModel):
    selector: dict[str, Any]


class AnnotationBody(BaseModel):
    type: str = "TextualBody"
    value: str = ""
    purpose: str = "commenting"


class AnnotationCreate(BaseModel):
    body: AnnotationBody | list[AnnotationBody] = AnnotationBody()
    target: AnnotationTarget


class AnnotationUpdate(BaseModel):
    body: AnnotationBody | list[AnnotationBody] | None = None
    target: AnnotationTarget | None = None


class Annotation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str = "Annotation"
    body: AnnotationBody | list[AnnotationBody] = AnnotationBody()
    target: AnnotationTarget
    created: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    modified: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

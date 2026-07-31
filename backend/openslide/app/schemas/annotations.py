from datetime import datetime, timezone
from typing import Any, Literal
import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AnnotationTarget(BaseModel):
    model_config = ConfigDict(extra="allow")

    selector: dict[str, Any]


class AnnotationBody(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str = "TextualBody"
    value: str = ""
    purpose: str = "commenting"


class AnnotationCreate(BaseModel):
    body: AnnotationBody | list[AnnotationBody] = Field(default_factory=AnnotationBody)
    target: AnnotationTarget


class AnnotationUpdate(BaseModel):
    body: AnnotationBody | list[AnnotationBody] | None = None
    target: AnnotationTarget | None = None
    revision: int | None = Field(default=None, ge=1)


class Annotation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str = "Annotation"
    body: AnnotationBody | list[AnnotationBody] = Field(default_factory=AnnotationBody)
    target: AnnotationTarget
    created: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    modified: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    revision: int = Field(default=1, ge=1)


class AnnotationMutation(BaseModel):
    action: Literal["create", "update", "delete"]
    annotation_id: str | None = None
    revision: int | None = Field(default=None, ge=1)
    body: AnnotationBody | list[AnnotationBody] | None = None
    target: AnnotationTarget | None = None

    @model_validator(mode="after")
    def validate_operation(self):
        if self.action in {"update", "delete"} and not self.annotation_id:
            raise ValueError("annotation_id is required for update and delete operations")
        if self.action == "create" and self.target is None:
            raise ValueError("target is required for create operations")
        if self.action == "update" and self.body is None and self.target is None:
            raise ValueError("update operations require body or target")
        return self


class AnnotationBatchRequest(BaseModel):
    operations: list[AnnotationMutation] = Field(min_length=1, max_length=1000)


class AnnotationBatchResponse(BaseModel):
    created: list[Annotation] = Field(default_factory=list)
    updated: list[Annotation] = Field(default_factory=list)
    deleted: list[str] = Field(default_factory=list)

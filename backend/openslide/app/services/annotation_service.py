import json
import os
from datetime import datetime, timezone

from core.config import settings
from core.exceptions import AnnotationNotFoundError
from schemas.annotations import Annotation, AnnotationCreate, AnnotationUpdate


def _get_annotation_file(slide_id: str) -> str:
    return os.path.join(settings.annotation_dir, f"{slide_id}.json")


def _load_annotations(slide_id: str) -> list[dict]:
    filepath = _get_annotation_file(slide_id)
    if not os.path.exists(filepath):
        return []
    with open(filepath, "r") as f:
        return json.load(f)


def _save_annotations(slide_id: str, annotations: list[dict]) -> None:
    filepath = _get_annotation_file(slide_id)
    with open(filepath, "w") as f:
        json.dump(annotations, f, indent=2, default=str)


def get_annotations(slide_id: str) -> list[dict]:
    return _load_annotations(slide_id)


def get_annotation(slide_id: str, annotation_id: str) -> dict:
    annotations = _load_annotations(slide_id)
    for ann in annotations:
        if ann["id"] == annotation_id:
            return ann
    raise AnnotationNotFoundError(annotation_id)


def create_annotation(slide_id: str, data: AnnotationCreate) -> Annotation:
    annotations = _load_annotations(slide_id)
    annotation = Annotation(
        body=data.body,
        target=data.target,
    )
    annotations.append(annotation.model_dump())
    _save_annotations(slide_id, annotations)
    return annotation


def update_annotation(slide_id: str, annotation_id: str, data: AnnotationUpdate) -> dict:
    annotations = _load_annotations(slide_id)
    for i, ann in enumerate(annotations):
        if ann["id"] == annotation_id:
            if data.body is not None:
                ann["body"] = data.body.model_dump() if not isinstance(data.body, list) else [b.model_dump() for b in data.body]
            if data.target is not None:
                ann["target"] = data.target.model_dump()
            ann["modified"] = datetime.now(timezone.utc).isoformat()
            annotations[i] = ann
            _save_annotations(slide_id, annotations)
            return ann
    raise AnnotationNotFoundError(annotation_id)


def delete_annotation(slide_id: str, annotation_id: str) -> None:
    annotations = _load_annotations(slide_id)
    new_annotations = [a for a in annotations if a["id"] != annotation_id]
    if len(new_annotations) == len(annotations):
        raise AnnotationNotFoundError(annotation_id)
    _save_annotations(slide_id, new_annotations)

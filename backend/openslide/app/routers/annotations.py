from fastapi import APIRouter, Query

from app.services import annotation_service
from app.schemas.annotations import (
    AnnotationBatchRequest,
    AnnotationBatchResponse,
    AnnotationCreate,
    AnnotationUpdate,
)

router = APIRouter(prefix="/api/annotations", tags=["annotations"])


@router.get("/{slide_id}")
def get_annotations(slide_id: str):
    """Get all annotations for a slide."""
    return annotation_service.get_annotations(slide_id)


@router.get("/{slide_id}/{annotation_id}")
def get_annotation(slide_id: str, annotation_id: str):
    """Get a single annotation by ID."""
    return annotation_service.get_annotation(slide_id, annotation_id)


@router.post("/{slide_id}", status_code=201)
def create_annotation(slide_id: str, data: AnnotationCreate):
    """Create a new annotation for a slide."""
    return annotation_service.create_annotation(slide_id, data)


@router.post("/{slide_id}/batch", response_model=AnnotationBatchResponse)
def apply_annotation_batch(slide_id: str, data: AnnotationBatchRequest):
    """Apply an annotation mutation set atomically."""
    return annotation_service.apply_batch(slide_id, data)


@router.put("/{slide_id}/{annotation_id}")
def update_annotation(slide_id: str, annotation_id: str, data: AnnotationUpdate):
    """Update an existing annotation."""
    return annotation_service.update_annotation(slide_id, annotation_id, data)


@router.delete("/{slide_id}/{annotation_id}", status_code=204)
def delete_annotation(
    slide_id: str,
    annotation_id: str,
    revision: int | None = Query(default=None, ge=1),
):
    """Delete an annotation."""
    annotation_service.delete_annotation(slide_id, annotation_id, revision)

from fastapi import APIRouter

from services import annotation_service
from schemas.annotations import AnnotationCreate, AnnotationUpdate

router = APIRouter(prefix="/api/annotations", tags=["annotations"])


@router.get("/{slide_id}")
async def get_annotations(slide_id: str):
    """Get all annotations for a slide."""
    return annotation_service.get_annotations(slide_id)


@router.get("/{slide_id}/{annotation_id}")
async def get_annotation(slide_id: str, annotation_id: str):
    """Get a single annotation by ID."""
    return annotation_service.get_annotation(slide_id, annotation_id)


@router.post("/{slide_id}", status_code=201)
async def create_annotation(slide_id: str, data: AnnotationCreate):
    """Create a new annotation for a slide."""
    return annotation_service.create_annotation(slide_id, data)


@router.put("/{slide_id}/{annotation_id}")
async def update_annotation(slide_id: str, annotation_id: str, data: AnnotationUpdate):
    """Update an existing annotation."""
    return annotation_service.update_annotation(slide_id, annotation_id, data)


@router.delete("/{slide_id}/{annotation_id}", status_code=204)
async def delete_annotation(slide_id: str, annotation_id: str):
    """Delete an annotation."""
    annotation_service.delete_annotation(slide_id, annotation_id)

from fastapi import Request
from fastapi.responses import JSONResponse


class SlideNotFoundError(Exception):
    def __init__(self, filename: str):
        self.filename = filename
        super().__init__(f"Slide not found: {filename}")


class SlideOperationError(Exception):
    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


class AnnotationNotFoundError(Exception):
    def __init__(self, annotation_id: str):
        self.annotation_id = annotation_id
        super().__init__(f"Annotation not found: {annotation_id}")


class AnnotationConflictError(Exception):
    def __init__(self, annotation_id: str, expected: int, actual: int):
        self.annotation_id = annotation_id
        self.expected = expected
        self.actual = actual
        super().__init__(
            f"Annotation revision conflict for {annotation_id}: "
            f"expected {expected}, current revision is {actual}"
        )


async def slide_not_found_handler(request: Request, exc: SlideNotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


async def slide_operation_error_handler(request: Request, exc: SlideOperationError):
    return JSONResponse(status_code=500, content={"detail": exc.detail})


async def annotation_not_found_handler(request: Request, exc: AnnotationNotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


async def annotation_conflict_handler(request: Request, exc: AnnotationConflictError):
    return JSONResponse(
        status_code=409,
        content={
            "detail": str(exc),
            "annotation_id": exc.annotation_id,
            "expected_revision": exc.expected,
            "actual_revision": exc.actual,
        },
    )

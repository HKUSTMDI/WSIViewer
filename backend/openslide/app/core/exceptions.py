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


async def slide_not_found_handler(request: Request, exc: SlideNotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


async def slide_operation_error_handler(request: Request, exc: SlideOperationError):
    return JSONResponse(status_code=500, content={"detail": exc.detail})


async def annotation_not_found_handler(request: Request, exc: AnnotationNotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc)})

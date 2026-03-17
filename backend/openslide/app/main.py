from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.exceptions import (
    SlideNotFoundError,
    SlideOperationError,
    AnnotationNotFoundError,
    slide_not_found_handler,
    slide_operation_error_handler,
    annotation_not_found_handler,
)
from routers import slides, annotations

app = FastAPI(
    title=settings.app_name,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
app.add_exception_handler(SlideNotFoundError, slide_not_found_handler)
app.add_exception_handler(SlideOperationError, slide_operation_error_handler)
app.add_exception_handler(AnnotationNotFoundError, annotation_not_found_handler)

# Routers
app.include_router(slides.router)
app.include_router(annotations.router)

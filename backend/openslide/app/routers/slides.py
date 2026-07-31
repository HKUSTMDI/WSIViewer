from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query
from fastapi.responses import StreamingResponse, Response

from app.services import slide_service
from app.schemas.slides import HealthResponse, MppResponse

router = APIRouter(prefix="/api", tags=["slides"])


@router.get("/health", response_model=HealthResponse)
async def health_check():
    return {"status": "healthy!!"}


@router.get("/slides")
async def list_slides():
    """List all available WSI files."""
    return slide_service.list_slides()


@router.get("/region/{filename}/{level}/{x}/{y}/{width}/{height}")
async def read_region(
    filename: str,
    level: Annotated[int, Path(ge=0)],
    x: int,
    y: int,
    width: Annotated[
        int,
        Path(gt=0, le=slide_service.MAX_RASTER_DIMENSION),
    ],
    height: Annotated[
        int,
        Path(gt=0, le=slide_service.MAX_RASTER_DIMENSION),
    ],
):
    try:
        output = await slide_service.read_region(
            filename,
            level,
            x,
            y,
            width,
            height,
        )
    except slide_service.SlideRequestError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return StreamingResponse(output, media_type="image/png")


@router.get("/thumbnail/{filename}")
async def get_thumbnail(
    filename: str,
    width: Annotated[
        int,
        Query(gt=0, le=slide_service.MAX_RASTER_DIMENSION),
    ] = 200,
    height: Annotated[
        int,
        Query(gt=0, le=slide_service.MAX_RASTER_DIMENSION),
    ] = 200,
):
    try:
        output = await slide_service.get_thumbnail(filename, width, height)
    except slide_service.SlideRequestError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return StreamingResponse(output, media_type="image/png")


@router.get("/properties/{filename}")
async def get_properties(filename: str):
    return await slide_service.get_properties(filename)


@router.get("/mpp/{filename}", response_model=MppResponse)
async def get_mpp(filename: str):
    """Get microns-per-pixel info for scale bar and measurements."""
    return await slide_service.get_mpp(filename)


@router.get("/dzi/{filename}")
async def get_dzi_info(filename: str):
    dzi = await slide_service.get_dzi_info(filename)
    return Response(content=dzi, media_type="text/xml")


@router.get("/dzi/{filename}/{level}/{pos}")
async def get_dzi_tile(
    filename: str,
    level: Annotated[int, Path(ge=0)],
    pos: Annotated[
        str,
        Path(pattern=r"^[0-9]+_[0-9]+\.jpeg$", max_length=64),
    ],
):
    filename = filename.removesuffix("_files")
    x, y = pos.removesuffix(".jpeg").split("_", maxsplit=1)
    try:
        output = await slide_service.get_dzi_tile(filename, level, int(x), int(y))
    except slide_service.SlideRequestError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return StreamingResponse(output, media_type="image/JPEG")

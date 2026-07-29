from fastapi import APIRouter
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
    level: int = 0,
    x: int = 0,
    y: int = 0,
    width: int = 100,
    height: int = 100,
):
    output = await slide_service.read_region(filename, level, x, y, width, height)
    return StreamingResponse(output, media_type="image/png")


@router.get("/thumbnail/{filename}")
async def get_thumbnail(filename: str, width: int = 200, height: int = 200):
    output = await slide_service.get_thumbnail(filename, width, height)
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
async def get_dzi_tile(filename: str, level: int, pos: str):
    filename = filename.replace("_files", "")
    x, y = pos.replace(".jpeg", "").split("_")
    output = await slide_service.get_dzi_tile(filename, level, int(x), int(y))
    return StreamingResponse(output, media_type="image/JPEG")

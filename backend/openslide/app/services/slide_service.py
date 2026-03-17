import asyncio
from concurrent.futures import ThreadPoolExecutor
from openslide import OpenSlide, OpenSlideError
from openslide.deepzoom import DeepZoomGenerator
from PIL import Image
from io import BytesIO
import os

from core.config import settings
from core.exceptions import SlideNotFoundError, SlideOperationError

executor = ThreadPoolExecutor(max_workers=settings.max_workers)


def _get_slide_path(filename: str) -> str:
    file_path = os.path.join(settings.image_dir, filename)
    if not os.path.exists(file_path):
        raise SlideNotFoundError(filename)
    return file_path


def _read_region(slide_path: str, level: int, coords: tuple, size: tuple) -> Image.Image:
    try:
        with OpenSlide(slide_path) as slide:
            return slide.read_region(coords, level, size)
    except OpenSlideError as e:
        raise SlideOperationError(f"OpenSlide error: {str(e)}")


def _get_thumbnail(slide_path: str, size: tuple) -> Image.Image:
    try:
        with OpenSlide(slide_path) as slide:
            return slide.get_thumbnail(size)
    except OpenSlideError as e:
        raise SlideOperationError(f"OpenSlide error: {str(e)}")


def _get_properties(slide_path: str) -> dict:
    try:
        with OpenSlide(slide_path) as slide:
            return dict(slide.properties)
    except OpenSlideError as e:
        raise SlideOperationError(f"OpenSlide error: {str(e)}")


def _get_dzi_info(slide_path: str) -> str:
    try:
        with OpenSlide(slide_path) as slide:
            tile_size = slide.properties.get("openslide.level[0].tile-width", "256")
            dz = DeepZoomGenerator(slide, tile_size=int(tile_size), overlap=0)
            return dz.get_dzi("jpeg")
    except OpenSlideError as e:
        raise SlideOperationError(f"OpenSlide error: {str(e)}")


def _get_dzi_tile(slide_path: str, level: int, coords: tuple) -> Image.Image:
    try:
        with OpenSlide(slide_path) as slide:
            tile_size = slide.properties.get("openslide.level[0].tile-width", "256")
            dz = DeepZoomGenerator(slide, tile_size=int(tile_size), overlap=0)
            return dz.get_tile(level, coords)
    except OpenSlideError as e:
        raise SlideOperationError(f"OpenSlide error: {str(e)}")


def _get_mpp(slide_path: str) -> dict:
    try:
        with OpenSlide(slide_path) as slide:
            props = slide.properties
            mpp_x = props.get("openslide.mpp-x")
            mpp_y = props.get("openslide.mpp-y")
            objective = props.get("openslide.objective-power")
            return {
                "mpp_x": float(mpp_x) if mpp_x else None,
                "mpp_y": float(mpp_y) if mpp_y else None,
                "objective_power": float(objective) if objective else None,
            }
    except OpenSlideError as e:
        raise SlideOperationError(f"OpenSlide error: {str(e)}")


def _image_to_bytes(image: Image.Image, fmt: str = "PNG") -> BytesIO:
    output = BytesIO()
    image.save(output, format=fmt)
    output.seek(0)
    return output


def list_slides() -> list[dict]:
    """List all available WSI files."""
    slides = []
    image_dir = settings.image_dir
    if not os.path.exists(image_dir):
        return slides
    supported_ext = {".svs", ".tiff", ".tif", ".ndpi", ".vms", ".vmu", ".scn", ".mrxs", ".bif"}
    for f in os.listdir(image_dir):
        ext = os.path.splitext(f)[1].lower()
        if ext in supported_ext:
            file_path = os.path.join(image_dir, f)
            size = os.path.getsize(file_path)
            slides.append({"filename": f, "size_bytes": size})
    return slides


# Async wrappers for all operations

async def read_region(filename: str, level: int, x: int, y: int, width: int, height: int) -> BytesIO:
    slide_path = _get_slide_path(filename)
    loop = asyncio.get_event_loop()
    image = await loop.run_in_executor(executor, _read_region, slide_path, level, (x, y), (width, height))
    return _image_to_bytes(image, "PNG")


async def get_thumbnail(filename: str, width: int = 200, height: int = 200) -> BytesIO:
    slide_path = _get_slide_path(filename)
    loop = asyncio.get_event_loop()
    image = await loop.run_in_executor(executor, _get_thumbnail, slide_path, (width, height))
    return _image_to_bytes(image, "PNG")


async def get_properties(filename: str) -> dict:
    slide_path = _get_slide_path(filename)
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, _get_properties, slide_path)


async def get_dzi_info(filename: str) -> str:
    slide_path = _get_slide_path(filename)
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, _get_dzi_info, slide_path)


async def get_dzi_tile(filename: str, level: int, col: int, row: int) -> BytesIO:
    slide_path = _get_slide_path(filename)
    loop = asyncio.get_event_loop()
    image = await loop.run_in_executor(executor, _get_dzi_tile, slide_path, level, (col, row))
    return _image_to_bytes(image, "JPEG")


async def get_mpp(filename: str) -> dict:
    slide_path = _get_slide_path(filename)
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, _get_mpp, slide_path)

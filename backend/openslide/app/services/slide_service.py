import asyncio
import atexit
import threading
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from openslide import OpenSlide, OpenSlideError
from openslide.deepzoom import DeepZoomGenerator
from PIL import Image
from io import BytesIO
import os

from app.core.config import settings
from app.core.exceptions import SlideNotFoundError, SlideOperationError

executor = ThreadPoolExecutor(max_workers=settings.max_workers)
_thread_cache = threading.local()
_opened_slides: set[OpenSlide] = set()
_opened_slides_lock = threading.Lock()

MAX_RASTER_DIMENSION = 8192
MAX_RASTER_PIXELS = 16_777_216


class SlideRequestError(ValueError):
    """Raised when a requested raster cannot be served within safe bounds."""


@dataclass
class _SlideHandle:
    slide: OpenSlide
    deep_zoom: DeepZoomGenerator
    modified_ns: int


def _close_slide(slide: OpenSlide) -> None:
    with _opened_slides_lock:
        _opened_slides.discard(slide)
    try:
        slide.close()
    except Exception:
        pass


def _register_slide(slide: OpenSlide) -> None:
    with _opened_slides_lock:
        _opened_slides.add(slide)


def _close_all_slides() -> None:
    with _opened_slides_lock:
        slides = list(_opened_slides)
        _opened_slides.clear()
    for slide in slides:
        _close_slide(slide)
    executor.shutdown(wait=False, cancel_futures=True)


atexit.register(_close_all_slides)


def _get_cached_handle(slide_path: str) -> _SlideHandle:
    cache: OrderedDict[str, _SlideHandle] = getattr(
        _thread_cache,
        "handles",
        OrderedDict(),
    )
    _thread_cache.handles = cache
    modified_ns = os.stat(slide_path).st_mtime_ns
    cached = cache.pop(slide_path, None)
    if cached and cached.modified_ns == modified_ns:
        cache[slide_path] = cached
        return cached
    if cached:
        _close_slide(cached.slide)

    slide = OpenSlide(slide_path)
    tile_size = int(slide.properties.get("openslide.level[0].tile-width", "256"))
    handle = _SlideHandle(
        slide=slide,
        deep_zoom=DeepZoomGenerator(slide, tile_size=tile_size, overlap=0),
        modified_ns=modified_ns,
    )
    cache[slide_path] = handle
    _register_slide(slide)

    limit = max(1, settings.slide_cache_size_per_thread)
    while len(cache) > limit:
        _, evicted = cache.popitem(last=False)
        _close_slide(evicted.slide)
    return handle


def _clear_current_thread_cache() -> None:
    cache: OrderedDict[str, _SlideHandle] = getattr(
        _thread_cache,
        "handles",
        OrderedDict(),
    )
    for handle in cache.values():
        _close_slide(handle.slide)
    cache.clear()
    _thread_cache.handles = cache


def _get_slide_path(filename: str) -> str:
    file_path = os.path.join(settings.image_dir, filename)
    if not os.path.exists(file_path):
        raise SlideNotFoundError(filename)
    return file_path


def _read_region(slide_path: str, level: int, coords: tuple, size: tuple) -> Image.Image:
    try:
        slide = _get_cached_handle(slide_path).slide
        if level < 0 or level >= slide.level_count:
            raise SlideRequestError(
                f"level must be between 0 and {slide.level_count - 1}"
            )
        return slide.read_region(coords, level, size)
    except (OpenSlideError, OSError) as e:
        raise SlideOperationError(f"OpenSlide error: {str(e)}")


def _get_thumbnail(slide_path: str, size: tuple) -> Image.Image:
    try:
        return _get_cached_handle(slide_path).slide.get_thumbnail(size)
    except (OpenSlideError, OSError) as e:
        raise SlideOperationError(f"OpenSlide error: {str(e)}")


def _get_properties(slide_path: str) -> dict:
    try:
        return dict(_get_cached_handle(slide_path).slide.properties)
    except (OpenSlideError, OSError) as e:
        raise SlideOperationError(f"OpenSlide error: {str(e)}")


def _get_dzi_info(slide_path: str) -> str:
    try:
        return _get_cached_handle(slide_path).deep_zoom.get_dzi("jpeg")
    except (OpenSlideError, OSError) as e:
        raise SlideOperationError(f"OpenSlide error: {str(e)}")


def _get_dzi_tile(slide_path: str, level: int, coords: tuple) -> Image.Image:
    try:
        deep_zoom = _get_cached_handle(slide_path).deep_zoom
        if level < 0 or level >= deep_zoom.level_count:
            raise SlideRequestError(
                f"Deep Zoom level must be between 0 and {deep_zoom.level_count - 1}"
            )
        col, row = coords
        columns, rows = deep_zoom.level_tiles[level]
        if col < 0 or col >= columns or row < 0 or row >= rows:
            raise SlideRequestError("Deep Zoom tile coordinates are out of bounds")
        return deep_zoom.get_tile(level, coords)
    except (OpenSlideError, OSError) as e:
        raise SlideOperationError(f"OpenSlide error: {str(e)}")


def _get_mpp(slide_path: str) -> dict:
    try:
        props = _get_cached_handle(slide_path).slide.properties
        mpp_x = props.get("openslide.mpp-x")
        mpp_y = props.get("openslide.mpp-y")
        objective = props.get("openslide.objective-power")
        return {
            "mpp_x": float(mpp_x) if mpp_x else None,
            "mpp_y": float(mpp_y) if mpp_y else None,
            "objective_power": float(objective) if objective else None,
        }
    except (OpenSlideError, OSError) as e:
        raise SlideOperationError(f"OpenSlide error: {str(e)}")


def _image_to_bytes(image: Image.Image, fmt: str = "PNG") -> BytesIO:
    output = BytesIO()
    image.save(output, format=fmt)
    output.seek(0)
    return output


def _encode_and_close(image: Image.Image, fmt: str) -> BytesIO:
    try:
        return _image_to_bytes(image, fmt)
    finally:
        image.close()


def _read_region_bytes(
    slide_path: str,
    level: int,
    coords: tuple,
    size: tuple,
) -> BytesIO:
    return _encode_and_close(_read_region(slide_path, level, coords, size), "PNG")


def _get_thumbnail_bytes(slide_path: str, size: tuple) -> BytesIO:
    return _encode_and_close(_get_thumbnail(slide_path, size), "PNG")


def _get_dzi_tile_bytes(slide_path: str, level: int, coords: tuple) -> BytesIO:
    return _encode_and_close(_get_dzi_tile(slide_path, level, coords), "JPEG")


def _validate_raster_size(width: int, height: int) -> None:
    if width <= 0 or height <= 0:
        raise SlideRequestError("width and height must be positive")
    if width > MAX_RASTER_DIMENSION or height > MAX_RASTER_DIMENSION:
        raise SlideRequestError(
            f"width and height must not exceed {MAX_RASTER_DIMENSION} pixels"
        )
    if width * height > MAX_RASTER_PIXELS:
        raise SlideRequestError(
            f"requested raster must not exceed {MAX_RASTER_PIXELS} pixels"
        )


def list_slides() -> list[dict]:
    """List all available WSI files."""
    slides = []
    image_dir = settings.image_dir
    if not os.path.exists(image_dir):
        return slides
    supported_ext = {".svs", ".tiff", ".tif", ".ndpi", ".vms", ".vmu", ".scn", ".mrxs", ".bif"}
    for f in sorted(os.listdir(image_dir)):
        ext = os.path.splitext(f)[1].lower()
        if ext in supported_ext:
            file_path = os.path.join(image_dir, f)
            size = os.path.getsize(file_path)
            slides.append({"filename": f, "size_bytes": size})
    return slides


# Async wrappers for all operations

async def read_region(
    filename: str,
    level: int,
    x: int,
    y: int,
    width: int,
    height: int,
) -> BytesIO:
    _validate_raster_size(width, height)
    if level < 0:
        raise SlideRequestError("level must be non-negative")
    slide_path = _get_slide_path(filename)
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        executor,
        _read_region_bytes,
        slide_path,
        level,
        (x, y),
        (width, height),
    )


async def get_thumbnail(filename: str, width: int = 200, height: int = 200) -> BytesIO:
    _validate_raster_size(width, height)
    slide_path = _get_slide_path(filename)
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        executor,
        _get_thumbnail_bytes,
        slide_path,
        (width, height),
    )


async def get_properties(filename: str) -> dict:
    slide_path = _get_slide_path(filename)
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(executor, _get_properties, slide_path)


async def get_dzi_info(filename: str) -> str:
    slide_path = _get_slide_path(filename)
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(executor, _get_dzi_info, slide_path)


async def get_dzi_tile(filename: str, level: int, col: int, row: int) -> BytesIO:
    if level < 0 or col < 0 or row < 0:
        raise SlideRequestError("Deep Zoom level and coordinates must be non-negative")
    slide_path = _get_slide_path(filename)
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        executor,
        _get_dzi_tile_bytes,
        slide_path,
        level,
        (col, row),
    )


async def get_mpp(filename: str) -> dict:
    slide_path = _get_slide_path(filename)
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(executor, _get_mpp, slide_path)

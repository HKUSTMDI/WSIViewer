import asyncio
from concurrent.futures import ThreadPoolExecutor
from openslide import OpenSlide, OpenSlideError
from openslide.deepzoom import DeepZoomGenerator
from typing import Any
import os

# 创建线程池
executor = ThreadPoolExecutor(max_workers=10)

# 通用的异步包装函数
async def use_openslide_async(slide_path: str, operation: str, *args, **kwargs) -> Any:
    """
    异步 OpenSlide 操作封装，通过线程池非阻塞运行同步代码。
    Args:
        slide_path (str): OpenSlide 文件路径。
        operation (str): 要执行的操作 (read_region, get_thumbnail, properties)。
        *args, **kwargs: 操作所需的其他参数。
    Returns:
        Any: 操作结果。
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, use_openslide, slide_path, operation, *args, **kwargs)

def use_openslide(slide_path: str, operation: str, *args, **kwargs) -> Any:
    """
    通用 OpenSlide 操作封装。
    Args:
        slide_path (str): OpenSlide 文件路径。
        operation (str): 要执行的操作 (read_region, get_thumbnail, properties)。
        *args, **kwargs: 操作所需的其他参数。
    Returns:
        Any: 操作结果。
    """
    if not os.path.exists(slide_path):
        raise FileNotFoundError(f"File {slide_path} does not exist.")
    
    try:
        with OpenSlide(slide_path) as slide:
            if operation == "read_region":
                coords = kwargs.get("coords", (0, 0))
                level = kwargs.get("level", 0)
                size = kwargs.get("size", (100, 100))
                return slide.read_region(coords, level, size)
            elif operation == "get_thumbnail":
                size = kwargs.get("size", (200, 200))
                return slide.get_thumbnail(size)
            elif operation == "properties":
                return dict(slide.properties)
            elif operation == "get_dzi_info":
                tile_size = slide.properties.get('openslide.level[0].tile-width')
                deep_zoom = DeepZoomGenerator(slide,tile_size=int(tile_size),overlap=0)
                dzi_info = deep_zoom.get_dzi('jpeg')
                return dzi_info
            elif operation == "get_dzi_tile":
                tile_size = slide.properties.get('openslide.level[0].tile-width')
                deep_zoom = DeepZoomGenerator(slide,tile_size=int(tile_size),overlap=0)
                level = kwargs.get("level", 0)
                coords = kwargs.get("coords", (0, 0))
                return deep_zoom.get_tile(level, coords)
            else:
                raise ValueError(f"Unknown operation: {operation}")
    except OpenSlideError as e:
        raise RuntimeError(f"OpenSlide error: {str(e)}")

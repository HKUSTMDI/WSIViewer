from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import StreamingResponse
from use_openslide import use_openslide
from io import BytesIO
import os

app = FastAPI(docs_url="/api/docs", redoc_url=None)

IMAGE_FILES_DIR = "./images/"

#健康检查
@app.get("/api/health")
async def health_check():
    """
    健康检查
    """
    return {"status": "healthy!!"}

#获取图片区域
@app.get("/api/region/{filename}/{level}/{x}/{y}/{width}/{height}")
async def read_slide(
    filename: str,
    level: int = 0,
    x: int = 0,
    y: int = 0,
    width: int = 100,
    height: int = 100,
):
    """
    API 接口，用于读取 OpenSlide 文件中的区域数据。
    Args:
        filename (str): 文件名
        level (int): 图像层级
        x (int): 区域左上角的 x 坐标
        y (int): 区域左上角的 y 坐标
        width (int): 区域宽度
        height (int): 区域高度
    Returns:
        图像数据（PNG 格式）
    """
    file_path = os.path.join(IMAGE_FILES_DIR, filename)
    try:
        region = use_openslide(
            slide_path=file_path,
            operation="read_region",
            level=level,
            coords=(x, y),
            size=(width, height),
        )
        # 转换为字节流返回（例如 PNG 格式）
        output = BytesIO()
        region.save(output, format="PNG")
        output.seek(0)
        return StreamingResponse(output, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# API：获取缩略图
@app.get("/api/thumbnail/{filename}")
async def get_thumbnail(filename: str, width: int = 200, height: int = 200):
    """
    API 接口，用于获取 OpenSlide 文件的缩略图。"""
    file_path = os.path.join(IMAGE_FILES_DIR, filename)
    try:
        thumbnail = use_openslide(
            slide_path=file_path,
            operation="get_thumbnail",
            size=(width, height),
        )
        output = BytesIO()
        thumbnail.save(output, format="PNG")
        output.seek(0)
        return StreamingResponse(output, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# API：获取属性信息
@app.get("/api/properties/{filename}")
async def get_properties(filename: str):
    """
    API 接口，用于获取 OpenSlide 文件的属性信息。
    """
    file_path = os.path.join(IMAGE_FILES_DIR, filename)
    try:
        properties = use_openslide(
            slide_path=file_path,
            operation="properties",
        )
        return properties
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
# API: dzi
@app.get("/api/dzi/{filename}")
async def dzi(filename: str):
    """
    API 接口，用于获取 OpenSlide 文件的 dzi 信息。    
    """
    file_path = os.path.join(IMAGE_FILES_DIR, filename)
    try:
        dzi = use_openslide(
            slide_path=file_path,
            operation="get_dzi_info",
        )
        return Response(content=dzi, media_type="text/xml")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dzi/{filename}/{level}/{pos}")
async def dzi(filename: str, level: int, pos: str):
    """
    API 接口，用于获取 OpenSlide 文件的 dzi 瓦片图。
    """
    filename = filename.replace('_files','')
    file_path = os.path.join(IMAGE_FILES_DIR, filename)
    x, y = pos.replace('.jpeg','').split('_')
    x = int(x)
    y = int(y)
    pos = (x, y)
    try:
        dzi = use_openslide(
            slide_path=file_path,
            operation="get_dzi_tile",
            level=level,
            coords=pos,
        )
        output = BytesIO()
        dzi.save(output, format="JPEG")
        output.seek(0)
        return StreamingResponse(output, media_type="image/JPEG")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

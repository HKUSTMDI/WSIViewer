# 后端开发文档

## 1. 项目概述

WSIViewer 后端基于 **FastAPI + OpenSlide** 构建，负责全切片图像（WSI）的读取、切片、缩略图生成和元数据提取。通过 Deep Zoom Image (DZI) 协议向前端提供高效的多级瓦片服务。

## 2. 技术栈

| 组件 | 版本 | 用途 |
|------|------|------|
| Python | 3.11 | 运行时 |
| FastAPI | latest | Web 框架 |
| OpenSlide | latest | WSI 文件读取 |
| Uvicorn | latest | ASGI 服务器 |
| Gunicorn | latest | 进程管理（生产环境） |
| pytest | latest | 测试框架 |
| httpx | latest | 异步 HTTP 测试客户端 |

## 3. 当前目录结构

```
backend/openslide/
├── app/
│   ├── main.py              # FastAPI 应用入口，所有路由定义
│   ├── use_openslide.py     # OpenSlide 操作封装
│   ├── test_main.py         # 测试用例
│   └── images/              # WSI 图像存储目录
├── requirements.txt         # Python 依赖
├── dockerfile               # Docker 构建配置
└── build.sh                 # 多平台构建脚本
```

## 4. 目标目录结构（重构后）

```
backend/openslide/
├── app/
│   ├── main.py              # FastAPI 应用创建、中间件注册、路由挂载
│   ├── core/
│   │   ├── config.py        # 配置管理（pydantic BaseSettings）
│   │   └── exceptions.py    # 全局异常处理
│   ├── routers/
│   │   ├── slides.py        # WSI 相关路由（DZI、瓦片、缩略图、属性）
│   │   └── annotations.py   # 标注 CRUD 路由
│   ├── services/
│   │   ├── slide_service.py # OpenSlide 业务逻辑（原 use_openslide.py）
│   │   └── annotation_service.py  # 标注业务逻辑
│   ├── schemas/
│   │   ├── slides.py        # WSI 相关请求/响应模型
│   │   └── annotations.py   # 标注请求/响应模型
│   ├── models/              # 数据库模型（如使用数据库存储标注）
│   │   └── annotation.py
│   └── images/              # WSI 图像存储目录
├── tests/
│   ├── test_slides.py       # WSI 路由测试
│   └── test_annotations.py  # 标注路由测试
├── requirements.txt
├── dockerfile
└── build.sh
```

## 5. 已实现的 API 端点

### 5.1 健康检查

```
GET /api/health
```
- 返回：`{"status": "healthy!!"}`

### 5.2 DZI 元数据

```
GET /api/dzi/{filename}
```
- 返回：DZI XML 格式的图像元数据（Content-Type: text/xml）
- 用途：OpenSeadragon 初始化时获取瓦片配置

### 5.3 DZI 瓦片

```
GET /api/dzi/{filename}/{level}/{col}_{row}.jpeg
```
- 返回：JPEG 格式的图像瓦片（StreamingResponse）
- 说明：`level` 为金字塔层级，`col_row` 为瓦片坐标

### 5.4 区域读取

```
GET /api/region/{filename}/{level}/{x}/{y}/{width}/{height}
```
- 返回：PNG 格式的任意矩形区域图像
- 参数：指定金字塔层级和坐标/尺寸

### 5.5 缩略图

```
GET /api/thumbnail/{filename}?width=200&height=200
```
- 返回：PNG 格式的缩略图
- 默认尺寸：200x200

### 5.6 属性信息

```
GET /api/properties/{filename}
```
- 返回：JSON 格式的 OpenSlide 元数据属性
- 包含：mpp-x、mpp-y（微米/像素）、厂商信息、放大倍率等

### 5.7 API 文档

```
GET /api/docs      # Swagger UI
GET /api/openapi.json  # OpenAPI Schema
```

## 6. OpenSlide 封装层

`use_openslide.py` 提供统一的 OpenSlide 操作接口：

| 操作 | 说明 |
|------|------|
| `read_region` | 读取指定层级和坐标的矩形区域 |
| `get_thumbnail` | 生成指定尺寸的缩略图 |
| `properties` | 获取 WSI 文件的元数据属性 |
| `get_dzi_info` | 生成 DZI XML 元数据 |
| `get_dzi_tile` | 获取指定层级和坐标的 DZI 瓦片 |

**并发模型**：使用 `ThreadPoolExecutor`（10 个工作线程）处理 CPU 密集型 OpenSlide 操作，提供 `use_openslide_async()` 异步包装器（目前未使用）。

## 7. 已知问题

1. **异步封装未使用**：`use_openslide_async()` 已定义但端点直接调用同步版本，会阻塞事件循环
2. **无 CORS 配置**：前后端分离开发时可能遇到跨域问题
3. **路径硬编码**：`IMAGE_FILES_DIR = "./images/"` 依赖工作目录
4. **无请求验证**：缺少 Pydantic 模型定义输入输出
5. **测试覆盖**：部分测试的 Content-Type 断言不一致（image/JPEG vs image/png）
6. **无认证/授权**：所有端点公开访问
7. **单文件架构**：所有路由和逻辑集中在 `main.py`，不利于扩展

## 8. 代码风格规范

### 8.1 Python 代码规范

- **格式化工具**：使用 `black`（行宽 88）
- **导入排序**：使用 `isort`，与 black 兼容
- **类型标注**：所有函数签名必须有类型标注
- **文档字符串**：使用 Google 风格的 docstring
- **命名约定**：
  - 变量/函数：`snake_case`
  - 类：`PascalCase`
  - 常量：`UPPER_SNAKE_CASE`
  - 私有方法：`_leading_underscore`

### 8.2 FastAPI 规范

- 路由函数使用 `async def`（I/O 密集型操作）
- 使用 Pydantic 模型定义请求体和响应体
- 使用 `APIRouter` 组织路由，每个模块独立文件
- 使用依赖注入（`Depends()`）管理数据库会话、认证等
- 统一错误响应格式
- 路由函数只处理 HTTP 层面逻辑，业务逻辑放在 service 层

### 8.3 注释语言

- 代码注释和文档字符串使用英文
- 开发文档可以使用中文

## 9. 部署架构

```
浏览器 → Nginx (:8082) → /api/*  → FastAPI (:4000) → OpenSlide → WSI 文件
                       → /*     → React 静态文件
```

- **Gunicorn**：4 个 Uvicorn worker 进程
- **Docker Compose**：三个服务（frontend_builder, backend, nginx）
- **镜像仓库**：`hkustmdi/wsi_image_viewer_backend:1.0`

## 10. 开发指南

### 本地开发

```bash
cd backend/openslide
pip install -r requirements.txt

# 运行开发服务器
uvicorn app.main:app --reload --host 0.0.0.0 --port 4000

# 运行测试
pytest app/test_main.py -v
```

### Docker 开发

```bash
docker compose up --build
```

### 添加新端点的流程

1. 在 `schemas/` 中定义请求/响应 Pydantic 模型
2. 在 `services/` 中实现业务逻辑
3. 在 `routers/` 中定义路由，调用 service 层
4. 在 `main.py` 中注册路由
5. 在 `tests/` 中编写对应测试
6. 更新本文档

## 11. 待实现功能（Annotation 相关）

### 11.1 标注存储 API

```
POST   /api/annotations/{slide_id}           # 创建标注
GET    /api/annotations/{slide_id}           # 获取切片所有标注
GET    /api/annotations/{slide_id}/{ann_id}  # 获取单个标注
PUT    /api/annotations/{slide_id}/{ann_id}  # 更新标注
DELETE /api/annotations/{slide_id}/{ann_id}  # 删除标注
```

### 11.2 标注数据模型

采用 [W3C Web Annotation](https://www.w3.org/TR/annotation-model/) 格式，兼容 Annotorious：

```json
{
  "id": "uuid",
  "slide_id": "filename",
  "type": "Annotation",
  "body": {
    "type": "TextualBody",
    "value": "标注说明",
    "purpose": "commenting"
  },
  "target": {
    "selector": {
      "type": "FragmentSelector",
      "conformsTo": "http://www.w3.org/TR/media-frags/",
      "value": "xywh=pixel:100,200,300,400"
    }
  },
  "created": "2024-01-01T00:00:00Z",
  "modified": "2024-01-01T00:00:00Z"
}
```

### 11.3 存储方案

初期使用 JSON 文件存储（每个 WSI 对应一个 JSON 文件），后续可迁移到 SQLite 或 PostgreSQL。

### 11.4 MPP（微米/像素）接口

为前端比例尺和测量工具提供 MPP 信息：

```
GET /api/mpp/{filename}
```
返回：
```json
{
  "mpp_x": 0.2528,
  "mpp_y": 0.2528,
  "objective_power": 40
}
```

此数据从 OpenSlide 属性 `openslide.mpp-x` 和 `openslide.mpp-y` 提取。

# 后端开发文档

本文描述 `main` 分支当前 FastAPI 后端的结构、接口和修改方式。它面向需要阅读、
调试或扩展后端的贡献者，不是历史整改记录。后端目录为 `backend/openslide`。

## 当前能力与技术栈

后端使用 Python 3.11、FastAPI、Pydantic Settings、OpenSlide、SQLite、Uvicorn 和
Gunicorn。它负责：

- 发现 WSI 文件；
- 返回属性、缩略图、任意区域、MPP、DZI metadata 和瓦片；
- 持久化 W3C Web Annotation 风格标注；
- 用 revision 做乐观并发控制；
- 在单个 SQLite 事务中执行橡皮擦等批量变更。

API 没有身份认证。开发和默认 Compose 只监听回环地址；公开部署必须由外层代理
负责访问控制、TLS 和必要的认证策略。

## 开发环境与启动

Python 依赖必须安装在虚拟环境中：

```bash
cd backend/openslide
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 4000
```

API 文档位于 <http://localhost:4000/api/docs>。从仓库根目录执行 `./dev.sh` 时，
脚本会显式把 `WSI_IMAGE_DIR` 和 `WSI_ANNOTATION_DIR` 指向根目录的 `images/` 和
`annotations/`，通常更适合全栈开发。

生产容器入口必须是：

```text
gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:4000
```

`app.main:app` 中的包前缀不能省略；旧版 `main:app` 会启动不包含当前路由的旧
模块。修改挂载中的 Python 文件后，Gunicorn 不会自动 reload，需要重启后端容器。

## 目录与分层

```text
backend/openslide/
├── app/
│   ├── main.py                    创建 FastAPI、CORS 和异常处理器
│   ├── core/config.py             `WSI_` 环境变量配置
│   ├── core/exceptions.py         领域异常到 HTTP 响应的映射
│   ├── routers/slides.py          WSI HTTP 路由和参数校验
│   ├── routers/annotations.py     标注 HTTP 路由
│   ├── schemas/slides.py          WSI 响应模型
│   ├── schemas/annotations.py     标注与批量变更模型
│   ├── services/slide_service.py  OpenSlide、线程池、缓存和编码
│   ├── services/annotation_service.py SQLite 事务与 revision
│   └── scripts/                   离线管理命令
├── tests/                         pytest 测试
├── requirements.txt               固定版本 Python 依赖
├── dockerfile                     生产镜像
└── build-image.sh                 通用镜像构建入口
```

路由层只处理 HTTP 参数、状态码和响应类型。OpenSlide 或数据库规则放在 service；
输入输出结构放在 schema；环境差异放在 Settings。不要让 router 直接操作 SQLite
文件或长期持有 OpenSlide 句柄。

## 配置

`app/core/config.py` 使用 `WSI_` 前缀读取环境变量：

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `WSI_APP_NAME` | `WSIViewer API` | OpenAPI 应用名称 |
| `WSI_IMAGE_DIR` | `./images/` | WSI 文件目录 |
| `WSI_ANNOTATION_DIR` | `./annotations/` | 标注数据目录 |
| `WSI_ANNOTATION_DB` | 空 | SQLite 文件；空时使用 `<annotation_dir>/annotations.db` |
| `WSI_MAX_WORKERS` | `10` | OpenSlide 线程池大小 |
| `WSI_SLIDE_CACHE_SIZE_PER_THREAD` | `2` | 每线程 LRU 句柄数 |
| `WSI_CORS_ORIGINS` | 本机 3000 端口 | 允许的浏览器跨域源 |

`WSI_CORS_ORIGINS` 是 JSON 数组，例如：

```bash
export WSI_CORS_ORIGINS='["https://viewer.example.com"]'
```

生产浏览器通常经 Nginx 同源访问 API，不需要开放额外 CORS。配置在模块导入时
创建；测试应 patch `settings` 或在导入应用前设置环境变量。

## WSI 文件发现

`GET /api/slides` 非递归扫描 `WSI_IMAGE_DIR`，按文件名排序，并对扩展名做不区分
大小写匹配。当前支持：

```text
.svs .tif .tiff .ndpi .vms .vmu .scn .mrxs .bif
```

列表接口只根据扩展名和文件大小发现文件，不会提前用 OpenSlide 打开验证。一个
文件可能出现在列表中，但在读取 DZI 时因格式内容不兼容而返回 OpenSlide 错误。

Docker Compose 将仓库根目录 `./images` 挂载到 `/app/images`；`dev.sh` 则通过
绝对环境变量指向同一个宿主机目录。遇到空列表时应分别检查：

```bash
docker compose exec -T WSIbackend python -c \
'from app.core.config import settings; import os; print(settings.image_dir); print(os.listdir(settings.image_dir))'

curl -i http://127.0.0.1:8082/api/slides
```

## HTTP API

### WSI 接口

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/health` | 健康检查 |
| `GET /api/slides` | 返回支持的 WSI 文件名和字节数 |
| `GET /api/dzi/{filename}` | 返回 Deep Zoom XML metadata |
| `GET /api/dzi/{filename}/{level}/{col}_{row}.jpeg` | 返回 JPEG 瓦片 |
| `GET /api/thumbnail/{filename}?width=200&height=200` | 返回 PNG 缩略图 |
| `GET /api/region/{filename}/{level}/{x}/{y}/{width}/{height}` | 返回 PNG 区域 |
| `GET /api/properties/{filename}` | 返回 OpenSlide properties |
| `GET /api/mpp/{filename}` | 返回 `mpp_x`、`mpp_y` 和 objective power |

DZI 客户端会在 metadata URL 的文件名后增加 `_files` 再请求瓦片。瓦片路由只用
`removesuffix("_files")` 移除协议后缀，不能对文件名中间的 `_files` 做全局替换。

`region` 和 `thumbnail` 的单边最大值为 8192 像素，总像素数不得超过
16,777,216。DZI level、行列和瓦片文件名也在进入 OpenSlide 前校验。无效请求
返回 422，而不是让库执行无界分配。

### 标注接口

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/annotations/{slide_id}` | 当前切片全部标注 |
| `POST /api/annotations/{slide_id}` | 创建标注，返回 201 |
| `GET /api/annotations/{slide_id}/{annotation_id}` | 单个标注 |
| `PUT /api/annotations/{slide_id}/{annotation_id}` | 更新 body 和/或 target |
| `DELETE /api/annotations/{slide_id}/{annotation_id}?revision=N` | 删除标注，返回 204 |
| `POST /api/annotations/{slide_id}/batch` | 原子执行 1–1000 个变更 |

单个标注包含 `id`、`type`、`body`、`target`、`created`、`modified` 和
`revision`。Pydantic 模型允许 body 与 target 的扩展字段，以保留未被当前 UI
直接编辑的 W3C 数据。

更新或删除可携带期望 revision。匹配时更新后 revision 加一；不匹配返回 409，
响应包含 annotation ID、期望值和实际值。不应在 service 外绕过此检查。

批量请求的每个 operation 为 `create`、`update` 或 `delete`。整个 batch 使用
`BEGIN IMMEDIATE`：任何验证、not found、revision 冲突或数据库错误都会回滚整批，
这是橡皮擦操作不会部分保存的基础。

### 状态码和异常

- 404：切片或标注不存在；
- 409：标注 revision 冲突；
- 422：FastAPI 参数校验或受限的图像请求无效；
- 500：OpenSlide 读取或服务端操作失败。

新增领域错误时在 `core/exceptions.py` 定义异常和 handler，并在 `main.py` 注册。
不要把异常字符串伪装成 200 响应。

## OpenSlide 并发与资源生命周期

OpenSlide 是同步且可能耗时的库。公开 service 方法通过共享
`ThreadPoolExecutor` 执行打开、读取和图像编码，避免阻塞 FastAPI event loop。

每个工作线程维护自己的 LRU：

- cache key 是完整 slide path；
- 文件 mtime 变化时关闭并重新打开；
- 每线程容量由 `WSI_SLIDE_CACHE_SIZE_PER_THREAD` 控制，最小为 1；
- 淘汰、显式清理和进程退出都会关闭 OpenSlide 句柄；
- Pillow 图像在工作线程编码完成后关闭。

不要跨线程共享一个 OpenSlide/DeepZoomGenerator 实例。增加新的图像操作时，应把
OpenSlide 调用、Pillow 编码和关闭都留在线程池任务内，并为异常和资源关闭补测试。

## 标注存储与并发

SQLite 默认位于 `annotations/annotations.db`。每次操作建立短连接，设置 30 秒
busy timeout，并启用 WAL。schema 初始化由进程内锁保护，同时处理多个 Gunicorn
进程首次访问时的 SQLite BUSY/LOCKED 竞争。

表中的 `data` 保存完整标注 JSON，独立的 revision、created、modified 字段用于
并发检查和排序。所有写操作使用显式事务；不要在事务外先读取 revision 再另开
连接写入。

仓库仍包含一次性的旧 JSON 导入兼容代码和 `migrate_annotations` 管理命令，但
全新部署不需要执行它，正常数据源是 SQLite。保留或修改这部分代码时应维护对应
并发和备份测试，不应在面向新用户的启动步骤中要求迁移。

## 常见修改方式

### 增加 WSI 接口

1. 在 `slide_service.py` 实现同步内部函数和异步包装。
2. 对 level、坐标、尺寸和内存上限先做边界校验。
3. 在 `routers/slides.py` 增加路由与 Path/Query 约束。
4. 如响应有固定结构，在 `schemas/slides.py` 添加模型。
5. 测试成功、文件不存在、OpenSlide 失败、非法边界和线程执行位置。

### 增加或修改标注字段/操作

1. 修改 `schemas/annotations.py`，继续允许不归当前功能管理的扩展字段。
2. 在 `annotation_service.py` 的同一事务内读取、校验 revision 和写入。
3. 批量语义变化时同时检查单项失败能否回滚前面的操作。
4. 同步修改前端类型、API 客户端和冲突恢复逻辑。
5. 增加 CRUD、409、并发和 batch rollback 测试。

### 增加配置

在 `Settings` 中增加有类型的字段并使用 `WSI_` 前缀。同步更新本文档、Compose
环境传递（若容器需要）和默认安全配置测试。秘密信息不应提交到 `.env.example`。

## 测试

```bash
cd backend/openslide
source .venv/bin/activate
pytest -v
```

测试位于 `backend/openslide/tests/`：

- `test_slides.py`：HTTP 路由、参数和响应；
- `test_slide_service.py`：线程池、缓存、编码与文件发现；
- `test_annotations.py`：CRUD、revision、事务、并发和扩展字段；
- `test_migration.py`：旧 JSON 兼容工具；
- `test_security_defaults.py`：默认 CORS 与网络安全假设。

测试不得依赖仓库中的大型真实 WSI。路由测试 patch service，OpenSlide service
测试使用 mock，数据库测试使用 pytest 临时目录。修复并发问题时应先加入能稳定
复现竞态或验证事务不变量的测试。

完整交付验证还包括：

```bash
docker compose config
docker compose build
docker compose up -d
curl --fail http://127.0.0.1:8082/api/health
./scripts/test-delivery.sh
```

`scripts/test-delivery.sh` 会对构建失败、静态文件原子发布、镜像脚本和 Compose
默认值做故障注入检查；它不能替代后端 pytest。

## Docker 与排障

```bash
./backend/openslide/build-image.sh
```

默认生成本机 `wsi-viewer-backend:local`。个人 registry wrapper 可使用被 Git 忽略
的 `backend/openslide/build.sh`，凭据必须留在 Docker credential store。

常见问题：

- `/api/health` 正常但 `/api/slides` 404：检查容器命令是否为 `app.main:app`，以及
  运行镜像是否包含当前路由；旧 `main:app` 只能证明旧健康接口存在。
- Nginx 首页 `/` 返回 200：只证明静态站点正常，不证明后端 API 正常。
- `No slides found`：直接请求 `/api/slides`，再检查容器内 `WSI_IMAGE_DIR` 和挂载。
- WSI 在列表中但 DZI 失败：扩展名受支持不代表文件内容一定能被 OpenSlide 打开。
- 修改源码后行为不变：开发 Uvicorn 有 reload；Gunicorn 容器必须重启或重建。
- 反向代理子路径：内部 WSIViewer Nginx 应收到 `/api/*`；公开路径前缀由外层
  Nginx 剥离，详细配置见 README。

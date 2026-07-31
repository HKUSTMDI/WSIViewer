# 后端开发文档

## 技术栈与目录

后端位于 `backend/openslide`，使用 Python 3.11、FastAPI、OpenSlide、Gunicorn 和 SQLite。

```text
backend/openslide/
├── app/
│   ├── main.py
│   ├── core/             配置与异常
│   ├── routers/          HTTP 路由
│   ├── schemas/          Pydantic 模型
│   ├── services/         OpenSlide 与标注服务
│   └── scripts/          管理命令
└── tests/
```

## 启动

```bash
cd backend/openslide
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 4000
```

API 文档位于 `http://localhost:4000/api/docs`。

后端 API 当前没有身份认证。只有在可信网络中需要其他机器访问时，才应显式监听
`0.0.0.0`；Docker Compose 和根目录 `dev.sh` 默认都只监听本机回环地址。

## 主要 API

```text
GET    /api/health
GET    /api/slides
GET    /api/dzi/{filename}
GET    /api/dzi/{filename}/{level}/{col}_{row}.jpeg
GET    /api/thumbnail/{filename}
GET    /api/properties/{filename}
GET    /api/mpp/{filename}

GET    /api/annotations/{slide_id}
POST   /api/annotations/{slide_id}
GET    /api/annotations/{slide_id}/{annotation_id}
PUT    /api/annotations/{slide_id}/{annotation_id}
DELETE /api/annotations/{slide_id}/{annotation_id}
POST   /api/annotations/{slide_id}/batch
```

更新与删除可以携带 revision。revision 不匹配返回 409。批量端点在一个 SQLite 事务中应用全部操作，任一步失败会回滚整批。

## 标注存储

默认数据库为 `annotations/annotations.db`。SQLite 启用 WAL 和 busy timeout，支持多个 Gunicorn worker 并发访问。

旧的 `{slide_id}.json` 在首次访问时自动导入。预先迁移和备份全部文件：

```bash
.venv/bin/python -m app.scripts.migrate_annotations
```

可用环境变量：

```text
WSI_IMAGE_DIR
WSI_ANNOTATION_DIR
WSI_ANNOTATION_DB
WSI_MAX_WORKERS
WSI_SLIDE_CACHE_SIZE_PER_THREAD
WSI_CORS_ORIGINS
```

`WSI_CORS_ORIGINS` 使用 JSON 数组格式，例如
`["https://viewer.example.com"]`。默认仅允许本机 Next.js 开发源；生产浏览器经
Nginx 同源访问 API，不需要放宽 CORS。

## OpenSlide 并发模型

- FastAPI 将 OpenSlide 工作提交到线程池。
- 每个线程维护有限大小的 LRU slide/DeepZoom 缓存。
- 文件 mtime 改变时重新打开。
- 缓存淘汰与进程退出时关闭句柄。
- Gunicorn 默认启动四个 Uvicorn worker。

## 测试

```bash
cd backend/openslide
.venv/bin/pytest -v
```

测试覆盖路由、SQLite CRUD、revision 冲突、批量回滚、并发更新、JSON 迁移以及 OpenSlide 缓存复用和淘汰。

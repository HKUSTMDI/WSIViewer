# WSIViewer

WSIViewer 是基于 Next.js、OpenSeadragon、Annotorious、FastAPI、OpenSlide 和 SQLite 的网页端全切片图像查看器。

## 功能

- DZI 瓦片浏览、平移、缩放、导航缩略图和真实比例尺。
- 矩形、椭圆、多边形和自由画笔标注。
- 可编辑的标注标签、备注和颜色，以及 GeoJSON 导出。
- 支持多片段和内部孔洞的连续几何橡皮擦。
- 基于 MPP 的长度和角度测量。
- 带 revision 冲突检测的事务化标注存储。
- 单元、属性、组件、并发以及 Chromium/Firefox/WebKit 测试。

## Docker 启动

将 WSI 文件放入 `images/`，然后运行：

```bash
docker compose up --build
```

访问：

- 查看器：<http://localhost:8082>
- API 文档：<http://localhost:8082/api/docs>

标注存储在 `annotations/annotations.db`。

## 本地开发

Python 依赖必须安装在虚拟环境中：

```bash
cd backend/openslide
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..
./dev.sh
```

前端地址为 <http://localhost:3000>，后端文档为 <http://localhost:4000/api/docs>。
`dev.sh` 会从仓库根目录的 `images/` 读取切片，并将标注写入根目录的
`annotations/`。启动前需确保 3000 和 4000 端口空闲；若旧开发进程仍占用端口，
脚本会明确报错并退出。

## 测试

```bash
cd backend/openslide
.venv/bin/pytest -v

cd ../../frontend/wsi-viewer
npm ci
npm run lint
npm run typecheck
npm run test:coverage
npm run test:e2e
npm run build
```

## 旧标注迁移

旧的逐切片 JSON 会在首次访问时自动导入。也可以预先迁移全部文件并创建备份：

```bash
cd backend/openslide
.venv/bin/python -m app.scripts.migrate_annotations
```

工程整改和验收要求见 [整改计划](docs/remediation-plan.md)。

## 许可证

MIT，详见 [LICENSE.txt](LICENSE.txt)。

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
docker compose up
```

全新克隆无需创建 `.env`。Docker Compose 默认使用已经发布的
`hkustmdi/wsi_image_viewer_backend:1.0` 和
`hkustmdi/wsi_image_viewer_frontend:2.0` 镜像。仓库提供了一份可直接运行的
完整配置 [`.env.example`](.env.example)；需要修改端口或镜像名称时再复制：

```bash
cp .env.example .env
# 仅在需要时修改 .env 中的端口或镜像名称。
docker compose up
```

本机 `.env` 会被 Git 忽略。

访问：

- 查看器：<http://localhost:8082>
- API 文档：<http://localhost:8082/api/docs>

标注存储在 `annotations/annotations.db`。

Docker Compose 默认只监听 `127.0.0.1`。将 `NGINX_BIND_HOST` 设为
`0.0.0.0` 会让查看器及其未鉴权 API 可被其他机器访问，因此只应在可信网络中
明确启用。

### 通过 URL 子路径反向代理

如果公开地址包含路径前缀，需要在前端构建前配置此前缀。例如公开地址为
`https://example.com/openmetal-wsiviewer/` 时，在 `.env` 中加入：

```dotenv
WSI_VIEWER_BASE_PATH=/openmetal-wsiviewer
```

然后重新生成静态前端并创建 Nginx 容器：

```bash
docker compose up -d --force-recreate WSI_frontend_builder nginx
```

外层 Nginx 需要在转发前移除路径前缀，`proxy_pass` 末尾的 `/` 不能省略：

```nginx
location = /openmetal-wsiviewer {
    return 301 /openmetal-wsiviewer/;
}

location /openmetal-wsiviewer/ {
    proxy_pass http://127.0.0.1:8082/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

这样 Next.js 静态资源、页面导航、API 和 DZI 瓦片请求都会保留在同一个公开
前缀下。如果 API 部署在其他地址，可以单独设置 `WSI_VIEWER_API_BASE`；留空时
默认为 `<base path>/api`。

## 本地开发

Python 依赖必须安装在虚拟环境中：

```bash
cd backend/openslide
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..

cd frontend/wsi-viewer
npm ci
cd ../..

./dev.sh
```

前端地址为 <http://localhost:3000>，后端文档为 <http://localhost:4000/api/docs>。
`dev.sh` 会从仓库根目录的 `images/` 读取切片，并将标注写入根目录的
`annotations/`。启动前需确保 3000 和 4000 端口空闲；若旧开发进程仍占用端口，
脚本会明确报错并退出。两个服务默认只监听 `127.0.0.1`；将
`WSI_DEV_HOST=0.0.0.0` 会把未鉴权的开发 API 暴露给网络，只应在可信网络中
有意启用。

## 构建容器镜像

仓库跟踪的 `build-image.sh` 是通用入口，默认仅构建名称中立的本地镜像。
用户可以据此构建并运行自己的定制镜像，而不需要修改公开的 Compose 配置：

```bash
./backend/openslide/build-image.sh
./frontend/wsi-viewer/build-image.sh

cp .env.example .env
# 在 .env 中设置：
# WSI_VIEWER_BACKEND_IMAGE=wsi-viewer-backend:local
# WSI_VIEWER_FRONTEND_IMAGE=wsi-viewer-frontend:local
docker compose up
```

发布到镜像仓库或构建多架构镜像时，可使用参数（也可使用对应的
`IMAGE_NAME`、`IMAGE_TAG`、`PLATFORMS` 和 `PUSH` 环境变量）：

```bash
./backend/openslide/build-image.sh \
  --image registry.example.com/team/wsi-backend \
  --tag 1.0.0 \
  --platform linux/amd64,linux/arm64 \
  --push
```

每位开发者可在通用脚本旁保留自己的 `build.sh` 包装脚本。此类脚本会被 Git
忽略，只应设置个人镜像名称等默认值，再调用 `build-image.sh`。镜像名称和标签
可以写入 `.env`，但仓库用户名、密码和令牌必须继续由开发者本机的 Docker
凭据存储管理。

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

cd ../..
./scripts/test-delivery.sh
```

工程整改和验收要求见 [整改计划](docs/remediation-plan.md)。

## 许可证

MIT，详见 [LICENSE.txt](LICENSE.txt)。

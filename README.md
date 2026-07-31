# WSIViewer

WSIViewer is a browser-based Whole Slide Image viewer built with Next.js, OpenSeadragon, Annotorious, FastAPI, OpenSlide, and SQLite.

## Features

- Deep Zoom Image browsing with pan, zoom, navigator, and physical scale bar.
- Rectangle, ellipse, polygon, and freehand annotations.
- Editable annotation labels, notes, and colors, with GeoJSON export.
- Continuous geometry-aware eraser with multipolygon and interior-hole support.
- Length and angle measurements using slide MPP metadata.
- Transactional annotation persistence with revision conflict detection.
- Unit, property, component, concurrency, and Chromium/Firefox/WebKit tests.

## Run with Docker

Place supported WSI files in `images/`, then run:

```bash
docker compose up
```

No `.env` file is required for a fresh clone. Docker Compose defaults to the
published `hkustmdi/wsi_image_viewer_backend:1.0` and
`hkustmdi/wsi_image_viewer_frontend:2.0` images. A complete optional
configuration is provided in [`.env.example`](.env.example):

```bash
cp .env.example .env
# Edit .env only when you need different ports or image names.
docker compose up
```

The local `.env` is intentionally ignored by Git.

Open:

- Viewer: <http://localhost:8082>
- API documentation: <http://localhost:8082/api/docs>

Annotations are stored in `annotations/annotations.db`.

Docker Compose binds to `127.0.0.1` by default. Setting
`NGINX_BIND_HOST=0.0.0.0` makes the viewer—and its unauthenticated API—reachable
from other machines, so only opt in on a trusted network.

## Local development

Create the backend virtual environment without installing Python packages globally:

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

The frontend runs at <http://localhost:3000>; the backend API runs at <http://localhost:4000/api/docs>.
`dev.sh` reads slides from the repository-level `images/` directory and stores
annotations in the repository-level `annotations/` directory. Ports 3000 and
4000 must be free; the script now exits with a clear error if an older
development process is still using either port. It also binds both services to
`127.0.0.1` by default. Setting `WSI_DEV_HOST=0.0.0.0` exposes the
unauthenticated development API to the network and should only be used
deliberately on a trusted network.

## Build container images

The tracked `build-image.sh` scripts are portable entry points with neutral
local defaults. This lets users build and run customized images without
changing the published Compose configuration:

```bash
./backend/openslide/build-image.sh
./frontend/wsi-viewer/build-image.sh

cp .env.example .env
# Set these two values in .env:
# WSI_VIEWER_BACKEND_IMAGE=wsi-viewer-backend:local
# WSI_VIEWER_FRONTEND_IMAGE=wsi-viewer-frontend:local
docker compose up
```

Use flags (or the equivalent `IMAGE_NAME`, `IMAGE_TAG`, `PLATFORMS`, and
`PUSH` environment variables) for a registry or multi-platform release:

```bash
./backend/openslide/build-image.sh \
  --image registry.example.com/team/wsi-backend \
  --tag 1.0.0 \
  --platform linux/amd64,linux/arm64 \
  --push
```

Developer-specific `build.sh` wrappers may be kept beside either generic
script. They are intentionally ignored by Git and should only set personal
image defaults before calling `build-image.sh`. Put image names and tags in
`.env`, but keep registry usernames, passwords, and tokens in the developer's
Docker credential store.

## Tests

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

See [the remediation plan](docs/remediation-plan.md) and the development documents in `docs/` for architecture and verification details.

## License

MIT. See [LICENSE.txt](LICENSE.txt).

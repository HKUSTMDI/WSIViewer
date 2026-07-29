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
docker compose up --build
```

Open:

- Viewer: <http://localhost:8082>
- API documentation: <http://localhost:8082/api/docs>

Annotations are stored in `annotations/annotations.db`.

## Local development

Create the backend virtual environment without installing Python packages globally:

```bash
cd backend/openslide
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..
./dev.sh
```

The frontend runs at <http://localhost:3000>; the backend API runs at <http://localhost:4000/api/docs>.
`dev.sh` reads slides from the repository-level `images/` directory and stores
annotations in the repository-level `annotations/` directory. Ports 3000 and
4000 must be free; the script now exits with a clear error if an older
development process is still using either port.

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
```

## Legacy annotation migration

Legacy per-slide JSON files are imported automatically on first access. To migrate all files up front and create a backup:

```bash
cd backend/openslide
.venv/bin/python -m app.scripts.migrate_annotations
```

See [the remediation plan](docs/remediation-plan.md) and the development documents in `docs/` for architecture and verification details.

## License

MIT. See [LICENSE.txt](LICENSE.txt).

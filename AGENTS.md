# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

WSIViewer is a web-based Whole Slide Image (WSI) viewer built with a **Next.js** frontend (OpenSeadragon + Annotorious) and **FastAPI** backend (OpenSlide). It uses Docker Compose to orchestrate three services: a Node-based frontend builder, a Python backend, and an Nginx reverse proxy.

## Common Commands

### Full Stack (Docker)
```bash
docker compose up                # Start all services (accessible at http://localhost:8082)
docker compose up --build        # Rebuild and start
```

### Frontend (frontend/wsi-viewer/)
```bash
cd frontend/wsi-viewer
npm install
npm run dev                      # Dev server on port 3000 (with API proxy to localhost:4000)
npm run build                    # Production build (static export to out/)
npm run lint                     # ESLint check
npm run typecheck                # TypeScript check
npm run test:coverage            # Unit/property/component tests + coverage gates
npm run test:e2e                 # Chromium, Firefox, and WebKit tests
```

### Backend (backend/openslide/)
```bash
cd backend/openslide
source .venv/bin/activate        # Activate venv (create with: python3 -m venv .venv && pip install -r requirements.txt)
pytest -v                        # Run all tests
uvicorn app.main:app --reload --host 0.0.0.0 --port 4000  # Dev server
```

Backend runs via Gunicorn with Uvicorn workers in production: `gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:4000`

**Important:** Always use venv or Docker for Python package installation. Never install globally.

## Architecture

### Request Flow
```
Browser → Nginx (:8082) → /api/*  → FastAPI backend (:4000)
                        → /*     → Next.js static files
```

### Frontend (frontend/wsi-viewer/)
- **Framework:** Next.js 16 + TypeScript + Tailwind CSS + shadcn/ui
- **Viewer:** OpenSeadragon with Annotorious v3 for annotations
- **State:** Zustand stores (viewerStore, annotationStore)
- **Pages:** `/` (slide list), `/viewer?file=xxx` (viewer with annotations + measurement)
- **Key components:**
  - `components/viewer/WSIViewer.tsx` — Annotorious + OpenSeadragon integration
  - `components/viewer/ViewerToolbar.tsx` — Tool selection (pan, rectangle, circle, polygon, freehand, measure)
  - `components/viewer/ScaleBar.tsx` — Dynamic scale bar using MPP
  - `components/annotation/AnnotationHandler.tsx` — Wires Annotorious events to API
  - `components/measurement/MeasureOverlay.tsx` — Canvas-based length/angle measurement
- **Critical geometry:** `src/features/annotation/geometry/` — pure, fully tested freehand/eraser geometry
- **API client:** `lib/api.ts`

### Backend (backend/openslide/)
- **Modular FastAPI app** with routers/services/schemas separation
- **Entry point:** `app/main.py` — creates app, registers CORS, mounts routers
- **Routers:** `routers/slides.py` (WSI endpoints), `routers/annotations.py` (CRUD)
- **Services:** `services/slide_service.py` (async OpenSlide + per-thread LRU), `services/annotation_service.py` (SQLite transactions)
- **Config:** `core/config.py` (pydantic BaseSettings, env prefix `WSI_`)
- **Key endpoints:**
  - `/api/slides` — list available WSI files
  - `/api/dzi/{filename}` — DZI metadata, `/api/dzi/{filename}/{level}/{pos}` — tiles
  - `/api/mpp/{filename}` — microns-per-pixel for scale bar
  - `/api/annotations/{slide_id}` — CRUD for annotations
  - `/api/annotations/{slide_id}/batch` — atomic mutation batches for eraser operations
  - `/api/docs` — Swagger UI

### Docker Services
- **WSI_frontend_builder:** Node 22 container, runs `next build`, outputs static files to `nginx/html/`
- **WSIbackend:** Python 3.11 container running FastAPI on port 4000
- **nginx:** Reverse proxy on port 8082 (configurable via `NGINX_PORT` in `.env`)

Directories:
- `images/` — WSI files (git-ignored), mounted into backend container
- `annotations/` — SQLite annotation database and legacy JSON files (git-ignored), mounted into backend container

### Development Docs
- `docs/backend-development.md` — Backend architecture, API reference, code style
- `docs/frontend-development.md` — Frontend architecture, component design, tech stack
- `docs/upgrade-plan.md` — Upgrade roadmap and task checklist

## Testing

Backend tests are in `tests/` (run from `backend/openslide/`) and cover WSI routes,
SQLite annotation transactions, concurrent revision conflicts, legacy migration, and slide caching.

Frontend tests live beside the source plus `e2e/`. Critical geometry must keep 100% line/function
coverage and at least 95% branch coverage.

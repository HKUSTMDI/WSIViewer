#!/bin/bash

# WSIViewer 本地开发启动脚本
# 同时启动后端 (port 4000) 和前端 (port 3000)
# Ctrl+C 停止所有服务

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

trap 'kill 0; exit' SIGINT SIGTERM

echo "=== WSIViewer Dev ==="

if command -v lsof >/dev/null 2>&1; then
  for port in 3000 4000; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
      echo "[error] Port $port is already in use."
      echo "        Stop the existing process before running ./dev.sh again:"
      echo "        lsof -nP -iTCP:$port -sTCP:LISTEN"
      exit 1
    fi
  done
fi

# Resolve data directories from the repository root instead of the backend
# process working directory. Explicit caller overrides still take precedence.
export WSI_IMAGE_DIR="${WSI_IMAGE_DIR:-$ROOT_DIR/images}"
export WSI_ANNOTATION_DIR="${WSI_ANNOTATION_DIR:-$ROOT_DIR/annotations}"
export NEXT_TELEMETRY_DISABLED="${NEXT_TELEMETRY_DISABLED:-1}"

# Backend
echo "[backend] Starting FastAPI on :4000 ..."
echo "[backend] Reading slides from: $WSI_IMAGE_DIR"
echo "[backend] Storing annotations in: $WSI_ANNOTATION_DIR"
source "$ROOT_DIR/backend/openslide/.venv/bin/activate"
cd "$ROOT_DIR/backend/openslide"
uvicorn app.main:app --reload --host 0.0.0.0 --port 4000 &

# Frontend
echo "[frontend] Starting Next.js on :3000 ..."
cd "$ROOT_DIR/frontend/wsi-viewer"
npm run dev &

echo ""
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:4000/api/docs"
echo "  Press Ctrl+C to stop"
echo ""

wait

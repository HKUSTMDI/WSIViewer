#!/bin/bash

# WSIViewer 本地开发启动脚本
# 同时启动后端 (port 4000) 和前端 (port 3000)
# Ctrl+C 停止所有服务

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

trap 'kill 0; exit' SIGINT SIGTERM

echo "=== WSIViewer Dev ==="

# Backend
echo "[backend] Starting FastAPI on :4000 ..."
source "$ROOT_DIR/backend/openslide/.venv/bin/activate"
cd "$ROOT_DIR/backend/openslide/app"
uvicorn main:app --reload --host 0.0.0.0 --port 4000 &

# Frontend
echo "[frontend] Starting Next.js on :3000 ..."
cd "$ROOT_DIR/frontend2"
npm run dev &

echo ""
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:4000/api/docs"
echo "  Press Ctrl+C to stop"
echo ""

wait

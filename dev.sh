#!/bin/bash

set -Eeuo pipefail

# WSIViewer 本地开发启动脚本
# 同时启动后端 (port 4000) 和前端 (port 3000)
# Ctrl+C 停止所有服务

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

backend_pid=""
frontend_pid=""
cleanup_started=0

cleanup() {
  local exit_status="${1:-$?}"
  local pid
  local attempt
  local still_running

  if [[ "$cleanup_started" -eq 1 ]]; then
    return
  fi
  cleanup_started=1
  trap - EXIT INT TERM

  for pid in "$backend_pid" "$frontend_pid"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done

  # Give both service supervisors a short opportunity to stop their children.
  for attempt in {1..30}; do
    still_running=0
    for pid in "$backend_pid" "$frontend_pid"; do
      if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        still_running=1
      fi
    done
    [[ "$still_running" -eq 0 ]] && break
    sleep 0.1
  done

  for pid in "$backend_pid" "$frontend_pid"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
    if [[ -n "$pid" ]]; then
      wait "$pid" 2>/dev/null || true
    fi
  done

  exit "$exit_status"
}

handle_signal() {
  local signal_status="$1"
  exit "$signal_status"
}

monitor_services() {
  local pid
  local service
  local child_status

  while true; do
    for service in backend frontend; do
      if [[ "$service" == backend ]]; then
        pid="$backend_pid"
      else
        pid="$frontend_pid"
      fi

      if ! kill -0 "$pid" 2>/dev/null; then
        set +e
        wait "$pid"
        child_status=$?
        set -e
        if [[ "$child_status" -eq 0 ]]; then
          child_status=1
        fi
        echo "[error] $service service exited (status $child_status); stopping the other service." >&2
        return "$child_status"
      fi
    done
    sleep 0.5
  done
}

trap 'cleanup "$?"' EXIT
trap 'handle_signal 130' INT
trap 'handle_signal 143' TERM

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
# Keep the unauthenticated development services on this machine by default.
# Set WSI_DEV_HOST=0.0.0.0 explicitly when access from another host is needed.
WSI_DEV_HOST="${WSI_DEV_HOST:-127.0.0.1}"

# Backend
echo "[backend] Starting FastAPI on $WSI_DEV_HOST:4000 ..."
echo "[backend] Reading slides from: $WSI_IMAGE_DIR"
echo "[backend] Storing annotations in: $WSI_ANNOTATION_DIR"
if [[ ! -f "$ROOT_DIR/backend/openslide/.venv/bin/activate" ]]; then
  echo "[error] Backend virtual environment is missing." >&2
  echo "        Create it under backend/openslide/.venv and install requirements first." >&2
  exit 1
fi
source "$ROOT_DIR/backend/openslide/.venv/bin/activate"
cd "$ROOT_DIR/backend/openslide"
uvicorn app.main:app --reload --host "$WSI_DEV_HOST" --port 4000 &
backend_pid=$!

# Frontend
echo "[frontend] Starting Next.js on $WSI_DEV_HOST:3000 ..."
cd "$ROOT_DIR/frontend/wsi-viewer"
if [[ ! -x "$ROOT_DIR/frontend/wsi-viewer/node_modules/.bin/next" ]]; then
  echo "[error] Frontend dependencies are missing." >&2
  echo "        Run 'cd frontend/wsi-viewer && npm ci' first." >&2
  exit 1
fi
"$ROOT_DIR/frontend/wsi-viewer/node_modules/.bin/next" dev \
  --hostname "$WSI_DEV_HOST" &
frontend_pid=$!

echo ""
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:4000/api/docs"
echo "  Press Ctrl+C to stop"
echo ""

set +e
monitor_services
status=$?
set -e
exit "$status"

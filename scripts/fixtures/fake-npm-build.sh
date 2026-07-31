#!/bin/sh

set -eu

if [ "${1:-}" != run ] || [ "${2:-}" != build ]; then
  echo "fake npm only supports: npm run build" >&2
  exit 2
fi

if [ "${FAKE_NPM_FAIL:-false}" = true ]; then
  echo "simulated frontend build failure" >&2
  exit 42
fi

marker=$(tr -d '\r\n' < src/build-marker.txt)
if [ -z "$marker" ]; then
  echo "missing build marker" >&2
  exit 2
fi

mkdir -p "out/_next/static/chunks"
printf '%s\n' "<!doctype html><title>WSIViewer $marker</title><script src=\"/_next/static/chunks/$marker.js\"></script>" \
  > out/index.html
printf '%s\n' "console.log('$marker')" > "out/_next/static/chunks/$marker.js"

if [ -f src/app/removed/page.tsx ]; then
  printf '%s\n' "<!doctype html><title>Removed page</title>" > out/removed.html
fi

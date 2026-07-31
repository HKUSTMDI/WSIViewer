#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

docker_bin="${DOCKER_BIN:-docker}"
image_name="${IMAGE_NAME:-wsi-viewer-backend}"
image_tag="${IMAGE_TAG:-local}"
platforms="${PLATFORMS:-}"
push="${PUSH:-false}"

usage() {
  cat <<'EOF'
Usage: ./build-image.sh [options]

Build the WSIViewer backend image with Docker Buildx.

Options:
  --image NAME          Image repository/name (default: wsi-viewer-backend)
  --tag TAG             Image tag (default: local)
  --platform PLATFORMS  Comma-separated target platforms
  --push                Push the result instead of loading it locally
  --load                Load a single-platform result locally (default)
  -h, --help            Show this help

The same values can be supplied through IMAGE_NAME, IMAGE_TAG, PLATFORMS,
and PUSH=true|false. Multi-platform builds require --push.
EOF
}

require_value() {
  if [ "$#" -lt 2 ] || [ -z "$2" ]; then
    echo "[error] $1 requires a value" >&2
    exit 2
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --image)
      require_value "$@"
      image_name=$2
      shift 2
      ;;
    --tag)
      require_value "$@"
      image_tag=$2
      shift 2
      ;;
    --platform|--platforms)
      require_value "$@"
      platforms=$2
      shift 2
      ;;
    --push)
      push=true
      shift
      ;;
    --load)
      push=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[error] Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$push" in
  true|1|yes)
    push=true
    ;;
  false|0|no)
    push=false
    ;;
  *)
    echo "[error] PUSH must be true or false" >&2
    exit 2
    ;;
esac

if [ -z "$image_name" ] || [ -z "$image_tag" ]; then
  echo "[error] Image name and tag must not be empty" >&2
  exit 2
fi
case "${image_name##*/}" in
  *:*)
    echo "[error] Put the tag in --tag/IMAGE_TAG, not in --image" >&2
    exit 2
    ;;
esac
if [ "$push" = false ]; then
  case "$platforms" in
    *,*)
      echo "[error] Multi-platform builds cannot be loaded locally; use --push" >&2
      exit 2
      ;;
  esac
fi

if ! command -v "$docker_bin" >/dev/null 2>&1; then
  echo "[error] Docker is required" >&2
  exit 1
fi
if ! "$docker_bin" buildx version >/dev/null 2>&1; then
  echo "[error] Docker Buildx is required" >&2
  exit 1
fi

set -- "$docker_bin" buildx build \
  --file "$SCRIPT_DIR/dockerfile" \
  --tag "$image_name:$image_tag"

if [ -n "$platforms" ]; then
  set -- "$@" --platform "$platforms"
fi
if [ "$push" = true ]; then
  set -- "$@" --push
  output_mode=push
else
  set -- "$@" --load
  output_mode=local-load
fi
set -- "$@" "$SCRIPT_DIR"

echo "Building $image_name:$image_tag"
echo "Platforms: ${platforms:-current Docker platform}"
echo "Output: $output_mode"
"$@"

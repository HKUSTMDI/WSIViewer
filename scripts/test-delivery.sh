#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TMP_BASE="${TMPDIR:-/tmp}"
TMP_DIR=$(mktemp -d "$TMP_BASE/wsi-viewer-delivery.XXXXXX")

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

fail() {
  echo "[FAIL] $*" >&2
  exit 1
}

assert_file() {
  [ -f "$1" ] || fail "expected file: $1"
}

assert_no_file() {
  [ ! -e "$1" ] || fail "unexpected file: $1"
}

assert_contains_line() {
  grep -Fqx -- "$1" "$2" || fail "expected '$1' in $2"
}

builder="$ROOT_DIR/frontend/wsi-viewer/build_nextjs.sh"
fake_npm="$ROOT_DIR/scripts/fixtures/fake-npm-build.sh"
fake_docker="$ROOT_DIR/scripts/fixtures/fake-docker.sh"
source_dir="$TMP_DIR/source"
work_dir="$TMP_DIR/work"
publish_dir="$TMP_DIR/publish"

run_builder() {
  SOURCE_DIR="$source_dir" \
  WORK_DIR="$work_dir" \
  PUBLISH_DIR="$publish_dir" \
  NPM_BIN="$fake_npm" \
  NODE_BIN="$NODE_BIN" \
  RELEASES_TO_KEEP=3 \
  PREVIOUS_ASSET_RELEASES=2 \
  FAKE_NPM_FAIL="${FAKE_NPM_FAIL:-false}" \
    sh "$builder"
}

if ! command -v node >/dev/null 2>&1; then
  fail "node is required to exercise the atomic symlink switch"
fi
NODE_BIN=$(command -v node)

sh -n "$builder"
sh -n "$ROOT_DIR/backend/openslide/build-image.sh"
sh -n "$ROOT_DIR/frontend/wsi-viewer/build-image.sh"
sh -n "$fake_npm"
sh -n "$fake_docker"
bash -n "$ROOT_DIR/dev.sh"

grep -Fq 'root /usr/share/nginx/html/current;' "$ROOT_DIR/nginx/nginx.conf" \
  || fail "nginx must serve the atomic current release"
if grep -Fq 'kill 0' "$ROOT_DIR/dev.sh"; then
  fail "dev.sh must not signal the caller process group"
fi

git -C "$ROOT_DIR" check-ignore -q images/example.svs \
  || fail "images contents must be ignored"
git -C "$ROOT_DIR" check-ignore -q backend/openslide/app/images/example.svs \
  || fail "legacy backend image contents must remain ignored"
if git -C "$ROOT_DIR" check-ignore -q images/.gitkeep; then
  fail "images/.gitkeep must remain trackable"
fi
git -C "$ROOT_DIR" check-ignore -q backend/openslide/build.sh \
  || fail "backend personal build wrapper must be ignored"
git -C "$ROOT_DIR" check-ignore -q frontend/wsi-viewer/build.sh \
  || fail "frontend personal build wrapper must be ignored"
git -C "$ROOT_DIR" check-ignore -q .env \
  || fail "developer-local .env must be ignored"
if git -C "$ROOT_DIR" check-ignore -q .env.example; then
  fail ".env.example must remain trackable"
fi
if git -C "$ROOT_DIR" check-ignore -q frontend/wsi-viewer/src/lib/api.ts; then
  fail "frontend src/lib must not be hidden by Python packaging ignores"
fi

if grep -Fq 'hkustmdi' "$ROOT_DIR/backend/openslide/build-image.sh" \
  || grep -Fq 'hkustmdi' "$ROOT_DIR/frontend/wsi-viewer/build-image.sh"; then
  fail "generic image build scripts must not contain maintainer-specific defaults"
fi
assert_file "$ROOT_DIR/.env.example"
assert_contains_line \
  'WSI_VIEWER_FRONTEND_IMAGE=hkustmdi/wsi_image_viewer_frontend:2.0' \
  "$ROOT_DIR/.env.example"
assert_contains_line \
  'WSI_VIEWER_BACKEND_IMAGE=hkustmdi/wsi_image_viewer_backend:1.0' \
  "$ROOT_DIR/.env.example"
if grep -Eq '^[[:space:]]+env_file:' "$ROOT_DIR/docker-compose.yml"; then
  fail "Docker Compose must not require a local .env file"
fi

mkdir -p "$source_dir/src/app/removed" "$source_dir/public" "$work_dir" "$publish_dir"
printf '%s\n' 'export default {}' > "$source_dir/next.config.ts"
printf '%s\n' '{}' > "$source_dir/tsconfig.json"
printf '%s\n' 'export default function Removed() {}' > "$source_dir/src/app/removed/page.tsx"
printf '%s\n' 'v1' > "$source_dir/src/build-marker.txt"

run_builder >/dev/null
[ -L "$publish_dir/current" ] || fail "successful build did not create current symlink"
current_v1=$(readlink "$publish_dir/current")
case "$current_v1" in
  .releases/release-*)
    ;;
  *)
    fail "current points outside the release directory: $current_v1"
    ;;
esac
release_v1="$publish_dir/$current_v1"
assert_file "$release_v1/index.html"
assert_file "$release_v1/removed.html"
assert_file "$release_v1/_next/static/chunks/v1.js"

sleep 1
rm -f "$source_dir/src/app/removed/page.tsx"
printf '%s\n' 'v2' > "$source_dir/src/build-marker.txt"
run_builder >/dev/null
current_v2=$(readlink "$publish_dir/current")
[ "$current_v2" != "$current_v1" ] || fail "successful build did not switch current"
release_v2="$publish_dir/$current_v2"
assert_file "$release_v2/index.html"
assert_file "$release_v2/_next/static/chunks/v2.js"
assert_file "$release_v2/_next/static/chunks/v1.js"
assert_no_file "$release_v2/removed.html"
assert_no_file "$work_dir/src/app/removed/page.tsx"

current_before_failure=$(readlink "$publish_dir/current")
release_count_before_failure=$(find "$publish_dir/.releases" -mindepth 1 -maxdepth 1 \
  -type d -name 'release-*' | wc -l | tr -d '[:space:]')
sleep 1
if NODE_BIN=$(command -v false) run_builder >/dev/null 2>&1; then
  fail "builder returned success when the atomic switch failed"
fi
NODE_BIN=$(command -v node)
[ "$(readlink "$publish_dir/current")" = "$current_before_failure" ] \
  || fail "failed atomic switch changed the current release"
release_count_after_switch_failure=$(find "$publish_dir/.releases" \
  -mindepth 1 -maxdepth 1 -type d -name 'release-*' \
  | wc -l | tr -d '[:space:]')
[ "$release_count_after_switch_failure" = "$release_count_before_failure" ] \
  || fail "failed atomic switch left an unpublished release"

if FAKE_NPM_FAIL=true run_builder >/dev/null 2>&1; then
  fail "builder returned success for a failed npm build"
fi
FAKE_NPM_FAIL=false
[ "$(readlink "$publish_dir/current")" = "$current_before_failure" ] \
  || fail "failed build changed the current release"
if find "$publish_dir/.releases" -mindepth 1 -maxdepth 1 \
  -type d -name '.staging-release-*' | grep -q .; then
  fail "failed build left a staging release"
fi

sleep 1
printf '%s\n' 'v3' > "$source_dir/src/build-marker.txt"
run_builder >/dev/null
sleep 1
printf '%s\n' 'v4' > "$source_dir/src/build-marker.txt"
run_builder >/dev/null
current_v4="$publish_dir/$(readlink "$publish_dir/current")"
assert_file "$current_v4/_next/static/chunks/v4.js"
assert_file "$current_v4/_next/static/chunks/v3.js"
assert_file "$current_v4/_next/static/chunks/v2.js"
assert_no_file "$current_v4/_next/static/chunks/v1.js"
release_count=$(find "$publish_dir/.releases" -mindepth 1 -maxdepth 1 \
  -type d -name 'release-*' | wc -l | tr -d '[:space:]')
[ "$release_count" = 3 ] || fail "expected 3 retained releases, found $release_count"

backend_log="$TMP_DIR/backend-docker.log"
DOCKER_BIN="$fake_docker" DOCKER_LOG="$backend_log" \
  sh "$ROOT_DIR/backend/openslide/build-image.sh" \
  --image example/backend --tag ci --platform linux/amd64 --load >/dev/null
assert_contains_line 'example/backend:ci' "$backend_log"
assert_contains_line 'linux/amd64' "$backend_log"
assert_contains_line '--load' "$backend_log"
assert_contains_line "$ROOT_DIR/backend/openslide" "$backend_log"

if DOCKER_BIN="$fake_docker" DOCKER_LOG="$TMP_DIR/invalid-docker.log" \
  sh "$ROOT_DIR/backend/openslide/build-image.sh" \
  --platform linux/amd64,linux/arm64 --load >/dev/null 2>&1; then
  fail "multi-platform local image build must be rejected"
fi

frontend_log="$TMP_DIR/frontend-docker.log"
DOCKER_BIN="$fake_docker" DOCKER_LOG="$frontend_log" \
  sh "$ROOT_DIR/frontend/wsi-viewer/build-image.sh" \
  --image example/frontend --tag ci \
  --platform linux/amd64,linux/arm64 --push >/dev/null
assert_contains_line 'example/frontend:ci' "$frontend_log"
assert_contains_line 'linux/amd64,linux/arm64' "$frontend_log"
assert_contains_line '--push' "$frontend_log"
assert_contains_line "$ROOT_DIR/frontend/wsi-viewer" "$frontend_log"

if command -v docker >/dev/null 2>&1 \
  && docker compose version >/dev/null 2>&1; then
  empty_env="$TMP_DIR/empty.env"
  : > "$empty_env"
  compose_defaults="$TMP_DIR/compose-defaults.yml"
  compose_example="$TMP_DIR/compose-example.yml"
  docker compose --project-directory "$ROOT_DIR" \
    --env-file "$empty_env" config > "$compose_defaults"
  docker compose --project-directory "$ROOT_DIR" \
    --env-file "$ROOT_DIR/.env.example" config > "$compose_example"
  grep -Fq 'host_ip: 127.0.0.1' "$compose_defaults" \
    || fail "Docker Compose must bind nginx to 127.0.0.1 by default"
  grep -Fq 'image: hkustmdi/wsi_image_viewer_frontend:2.0' "$compose_defaults" \
    || fail "Docker Compose must default to the published frontend image"
  grep -Fq 'image: hkustmdi/wsi_image_viewer_backend:1.0' "$compose_defaults" \
    || fail "Docker Compose must default to the published backend image"
  grep -Fq 'image: hkustmdi/wsi_image_viewer_frontend:2.0' "$compose_example" \
    || fail ".env.example must select the published frontend image"
  grep -Fq 'image: hkustmdi/wsi_image_viewer_backend:1.0' "$compose_example" \
    || fail ".env.example must select the published backend image"
else
  echo "[SKIP] Docker Compose config validation (Docker Compose unavailable)"
fi

echo "[PASS] delivery shell and atomic frontend release checks"

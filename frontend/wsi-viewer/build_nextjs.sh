#!/bin/sh

set -eu

SOURCE_DIR="${SOURCE_DIR:-/frontend/app_to_build}"
WORK_DIR="${WORK_DIR:-/frontend/app}"
PUBLISH_DIR="${PUBLISH_DIR:-/frontend/app/build}"
NPM_BIN="${NPM_BIN:-npm}"
NODE_BIN="${NODE_BIN:-node}"
RELEASES_TO_KEEP="${RELEASES_TO_KEEP:-3}"
PREVIOUS_ASSET_RELEASES="${PREVIOUS_ASSET_RELEASES:-2}"

case "$RELEASES_TO_KEEP" in
  ''|*[!0-9]*)
    echo "[error] RELEASES_TO_KEEP must be a positive integer" >&2
    exit 2
    ;;
esac
case "$PREVIOUS_ASSET_RELEASES" in
  ''|*[!0-9]*)
    echo "[error] PREVIOUS_ASSET_RELEASES must be a non-negative integer" >&2
    exit 2
    ;;
esac
if [ "$RELEASES_TO_KEEP" -lt 1 ]; then
  echo "[error] RELEASES_TO_KEEP must be at least 1" >&2
  exit 2
fi

start=$(date +%s)
echo "Next.js builder begin: $start"

for required_path in src public next.config.ts tsconfig.json; do
  if [ ! -e "$SOURCE_DIR/$required_path" ]; then
    echo "[error] Missing frontend build input: $SOURCE_DIR/$required_path" >&2
    exit 1
  fi
done

# The builder container can be restarted with its writable layer intact. Remove
# every source/output directory that may contain files deleted on the host.
rm -rf "$WORK_DIR/src" "$WORK_DIR/public" "$WORK_DIR/out" "$WORK_DIR/.next"
cp -R "$SOURCE_DIR/src" "$WORK_DIR/src"
cp -R "$SOURCE_DIR/public" "$WORK_DIR/public"
cp "$SOURCE_DIR/next.config.ts" "$WORK_DIR/next.config.ts"
cp "$SOURCE_DIR/tsconfig.json" "$WORK_DIR/tsconfig.json"

for optional_file in postcss.config.mjs components.json; do
  if [ -f "$SOURCE_DIR/$optional_file" ]; then
    cp "$SOURCE_DIR/$optional_file" "$WORK_DIR/$optional_file"
  else
    rm -f "$WORK_DIR/$optional_file"
  fi
done

cd "$WORK_DIR"
"$NPM_BIN" run build

if [ ! -s "$WORK_DIR/out/index.html" ]; then
  echo "[error] Next.js build did not produce a non-empty out/index.html" >&2
  exit 1
fi

releases_dir="$PUBLISH_DIR/.releases"
release_name="release-$(date -u +%Y%m%d%H%M%S)-$$"
staging_dir="$releases_dir/.staging-$release_name"
release_dir="$releases_dir/$release_name"
next_link="$PUBLISH_DIR/.current-$release_name"
current_link="$PUBLISH_DIR/current"
unpublished_release=""

cleanup() {
  published_target=""
  case "${staging_dir:-}" in
    "$releases_dir"/.staging-release-*)
      rm -rf "$staging_dir"
      ;;
  esac
  case "${next_link:-}" in
    "$PUBLISH_DIR"/.current-release-*)
      rm -f "$next_link"
      ;;
  esac
  case "${unpublished_release:-}" in
    "$releases_dir"/release-*)
      # A signal may arrive after renameSync published the release but before
      # the shell clears unpublished_release. Never remove current's target.
      if [ -L "$current_link" ]; then
        if published_target=$(readlink "$current_link" 2>/dev/null); then
          :
        else
          published_target=""
        fi
      fi
      if [ "$published_target" != ".releases/$release_name" ]; then
        rm -rf "$unpublished_release"
      fi
      ;;
  esac
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$staging_dir"

# Keep the hashed static assets referenced by the two most recent releases.
# Each release records only the assets produced by its own build, so this does
# not accumulate old assets forever.
copied_releases=0
for previous_release in $(find "$releases_dir" \
  -mindepth 1 -maxdepth 1 -type d -name 'release-*' | sort -r); do
  if [ "$copied_releases" -ge "$PREVIOUS_ASSET_RELEASES" ]; then
    break
  fi
  manifest="$previous_release/.wsi-own-static-files"
  if [ ! -f "$manifest" ]; then
    continue
  fi
  while IFS= read -r relative_path; do
    case "$relative_path" in
      _next/static/*)
        source_path="$previous_release/$relative_path"
        if [ -f "$source_path" ]; then
          destination_path="$staging_dir/$relative_path"
          mkdir -p "$(dirname "$destination_path")"
          cp "$source_path" "$destination_path"
        fi
        ;;
    esac
  done < "$manifest"
  copied_releases=$((copied_releases + 1))
done

cp -R "$WORK_DIR/out/." "$staging_dir/"
if [ -d "$WORK_DIR/out/_next/static" ]; then
  (
    cd "$WORK_DIR/out"
    find _next/static -type f -print | sort
  ) > "$staging_dir/.wsi-own-static-files"
else
  : > "$staging_dir/.wsi-own-static-files"
fi

if [ ! -s "$staging_dir/index.html" ]; then
  echo "[error] Staged frontend release is missing index.html" >&2
  exit 1
fi

if [ -e "$release_dir" ]; then
  echo "[error] Refusing to overwrite an existing release: $release_dir" >&2
  exit 1
fi
mv "$staging_dir" "$release_dir"
staging_dir=""
unpublished_release="$release_dir"
ln -s ".releases/$release_name" "$next_link"

# POSIX rename replaces the symlink atomically. Using Node avoids incompatible
# GNU/BSD/BusyBox mv flags while this script already runs in a Node image.
"$NODE_BIN" -e \
  'require("node:fs").renameSync(process.argv[1], process.argv[2])' \
  "$next_link" "$current_link"
next_link=""
unpublished_release=""

# Retain the current release and at most two complete predecessors. Cleanup is
# constrained to release-* directories under the dedicated .releases folder.
kept_previous=0
for old_release in $(find "$releases_dir" \
  -mindepth 1 -maxdepth 1 -type d -name 'release-*' | sort -r); do
  if [ "$old_release" = "$release_dir" ]; then
    continue
  fi
  kept_previous=$((kept_previous + 1))
  if [ "$kept_previous" -ge "$RELEASES_TO_KEEP" ]; then
    case "$old_release" in
      "$releases_dir"/release-*)
        rm -rf "$old_release"
        ;;
    esac
  fi
done

end=$(date +%s)
echo "Next.js build cost: $((end - start)) seconds"

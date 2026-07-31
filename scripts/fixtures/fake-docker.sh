#!/bin/sh

set -eu

if [ "${1:-}" = buildx ] && [ "${2:-}" = version ]; then
  exit 0
fi

: "${DOCKER_LOG:?DOCKER_LOG is required}"
printf '%s\n' "$@" > "$DOCKER_LOG"

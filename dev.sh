#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-5000}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

WATCH_DIRS=(
  "$ROOT/src"
  "$ROOT/frontend/src"
  "$ROOT/frontend/index.html"
)

cd "$ROOT"

if ! command -v php >/dev/null 2>&1; then
  echo "error: php not found in PATH" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "error: pnpm not found in PATH" >&2
  exit 1
fi

if ! command -v inotifywait >/dev/null 2>&1; then
  echo "error: inotifywait not found (install 'inotify-tools')" >&2
  exit 1
fi

echo "==> Building initial bundle..."
php build.php

echo "==> Starting PHP dev server on port $PORT..."
php -S "0.0.0.0:$PORT" "$ROOT/dist/index.php" &
PHP_PID=$!

cleanup() {
  kill "$PHP_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> Serving at http://localhost:$PORT"
echo "==> Watching src/ and frontend/ for changes (Ctrl-C to stop)"

while true; do
  inotifywait -q -r -e modify,create,delete,move \
    "${WATCH_DIRS[@]}" || true
  echo "==> Change detected, rebuilding..."
  php build.php
  echo "==> Rebuild complete. Reload http://localhost:$PORT"
done

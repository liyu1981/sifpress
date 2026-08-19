#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-5000}"
RETRY_INTERVAL="${RETRY_INTERVAL:-5}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

WATCH_DIRS=(
  "$ROOT/src"
  "$ROOT/admin_ui/src"
  "$ROOT/admin_ui/index.html"
  "$ROOT/ui_sdk/src"
)

cd "$ROOT"

# Development database location: ./var/sifpress/sys.db (see src/db.php).
# Override anytime with APP_DB_DIR=<folder>.
export APP_DB_DIR="./var/sifpress"

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

build() {
  php build.php
}

# The server needs dist/index.php to exist, so a missing artifact blocks
# (with retries) until the first build succeeds.
if [ ! -f "$ROOT/dist/index.php" ]; then
  echo "==> No dist/index.php yet — building (retrying every ${RETRY_INTERVAL}s)..."
  while ! build; do
    sleep "$RETRY_INTERVAL"
  done
  LAST_BUILD_OK=1
else
  echo "==> Building initial bundle..."
  if build; then
    LAST_BUILD_OK=1
  else
    echo "==> Initial build failed — serving the last good build and retrying."
    LAST_BUILD_OK=0
  fi
fi

echo "==> Starting PHP dev server on port $PORT..."
php -S "0.0.0.0:$PORT" "$ROOT/dist/index.php" &
PHP_PID=$!

cleanup() {
  kill "$PHP_PID" 2>/dev/null || true
}
trap cleanup EXIT
trap 'cleanup; exit 1' INT TERM

echo "==> Serving at http://localhost:$PORT"
echo "==> Watching src/, admin_ui/, and ui_sdk/ for changes (Ctrl-C to stop)"

while true; do
  if [ "$LAST_BUILD_OK" -eq 1 ]; then
    # Healthy: block until a file actually changes.
    inotifywait -q -r -e modify,create,delete,move \
      "${WATCH_DIRS[@]}" >/dev/null 2>&1 || true
  else
    # Failing: wait for a change OR retry at the fixed interval.
    inotifywait -q -r -t "$RETRY_INTERVAL" -e modify,create,delete,move \
      "${WATCH_DIRS[@]}" >/dev/null 2>&1 || true
  fi

  echo "==> Rebuilding..."
  if build; then
    echo "==> Rebuild complete. Reload http://localhost:$PORT"
    LAST_BUILD_OK=1
  else
    echo "==> Build failed — server keeps serving the last good build; retrying in ${RETRY_INTERVAL}s"
    LAST_BUILD_OK=0
  fi
done

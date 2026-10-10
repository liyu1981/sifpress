#!/usr/bin/env bash
set -euo pipefail

SIFPRESS_PORT="${SIFPRESS_PORT:-5000}"
SIFPRESS_RETRY_INTERVAL="${SIFPRESS_RETRY_INTERVAL:-5}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

WATCH_DIRS=(
  "$ROOT/src"
  "$ROOT/admin_ui/src"
  "$ROOT/admin_ui/index.html"
  "$ROOT/reagent/src"
  "$ROOT/reagent/styles.css"
  "$ROOT/ui_sdk/src"
  "$ROOT/sifronts/sifpress1/src"
  "$ROOT/sifronts/sifpress1/index.html"
  "$ROOT/sifronts/sifpress2/src"
  "$ROOT/sifronts/sifpress2/index.html"
)

cd "$ROOT"

# Asset bytes live outside the docroot (dist/) so they are only reachable
# through ?p=asset, which enforces is_public and the per-asset grants. The
# default <db_dir>/assets would be dist/var/sifpress/assets — i.e. inside the
# dev server's document root — so dev puts them in var/ in the repo
# (gitignored), for both the server and CLI commands alike.
ASSET_DIR_DEFAULT="$ROOT/var/sifpress/assets"
mkdir -p "$ASSET_DIR_DEFAULT"
export SIFPRESS_ASSET_DIR="${SIFPRESS_ASSET_DIR:-$ASSET_DIR_DEFAULT}"

# The web process inherits the env var above, but CLI runs (`php dist/index.php
# assets …`) do not, and the CLI must see the same directory as the web server.
# Persist it in the generated config once, so both read one source of truth.
CONFIG="$ROOT/dist/sifpress_config.php"
if [ -f "$CONFIG" ] && ! grep -q "SIFPRESS_ASSET_DIR" "$CONFIG"; then
  php -r '
    $path = $argv[1];
    $dir = $argv[2];
    $src = file_get_contents($path);
    $anchor = "define(\x27SIFPRESS_DB_DIR\x27";
    $at = strpos($src, $anchor);
    if ($at === false) { exit(0); }
    $lineEnd = strpos($src, "\n", $at);
    $insert = "\n\n/** Dev: asset bytes kept outside dist/ (see dev.sh). */\n"
        . "define(\x27SIFPRESS_ASSET_DIR\x27, " . var_export($dir, true) . ");";
    file_put_contents($path, substr($src, 0, $lineEnd) . $insert . substr($src, $lineEnd));
  ' "$CONFIG" "$SIFPRESS_ASSET_DIR"
  echo "==> Added SIFPRESS_ASSET_DIR to $CONFIG"
fi

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

inject_sifront_dev() {
  # Dev-only: push the freshly built sifpress1 bundle into the DB through the
  # same storage path the admin uses, so the served sifront is never stale.
  if [ -f "$ROOT/dist/sifpress1.bundle.js" ] && [ -f "$ROOT/dist/sifpress1.meta.json" ]; then
    if ! php "$ROOT/dist/index.php" inject_sifront sifpress1 >/dev/null; then
      echo "==> WARNING: inject_sifront failed; the dev server may serve a stale sifront." >&2
    fi
  fi
}

build() {
  php build.php && php buildfront.php && inject_sifront_dev
}

# The server needs dist/index.php to exist, so a missing artifact blocks
# (with retries) until the first build succeeds.
if [ ! -f "$ROOT/dist/index.php" ]; then
  echo "==> No dist/index.php yet — building (retrying every ${SIFPRESS_RETRY_INTERVAL}s)..."
  while ! build; do
    sleep "$SIFPRESS_RETRY_INTERVAL"
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

echo "==> Starting PHP dev server on port $SIFPRESS_PORT..."
echo "==> Assets: $SIFPRESS_ASSET_DIR"
# Run from dist/ so DOCUMENT_ROOT is the directory the built-in server actually
# exposes. The app refuses an asset directory inside DOCUMENT_ROOT (assets are
# served through ?p=asset, which enforces is_public and the per-asset grants),
# and with the repo root as the document root that check would wrongly reject
# the repo-level var/ folder used above.
(cd "$ROOT/dist" && php -S "0.0.0.0:$SIFPRESS_PORT" "$ROOT/dist/index.php") &
PHP_PID=$!

cleanup() {
  kill "$PHP_PID" 2>/dev/null || true
}
trap cleanup EXIT
trap 'cleanup; exit 1' INT TERM

echo "==> Serving at http://localhost:$SIFPRESS_PORT"
echo "==> Watching src/, admin_ui/, reagent/, ui_sdk/, sifronts/sifpress1 and sifronts/sifpress2 for changes (Ctrl-C to stop)"

while true; do
  if [ "$LAST_BUILD_OK" -eq 1 ]; then
    # Healthy: block until a file actually changes.
    inotifywait -q -r -e modify,create,delete,move \
      "${WATCH_DIRS[@]}" >/dev/null 2>&1 || true
  else
    # Failing: wait for a change OR retry at the fixed interval.
    inotifywait -q -r -t "$SIFPRESS_RETRY_INTERVAL" -e modify,create,delete,move \
      "${WATCH_DIRS[@]}" >/dev/null 2>&1 || true
  fi

  echo "==> Rebuilding..."
  if build; then
    echo "==> Rebuild complete. Reload http://localhost:$SIFPRESS_PORT"
    LAST_BUILD_OK=1
  else
    echo "==> Build failed — server keeps serving the last good build; retrying in ${SIFPRESS_RETRY_INTERVAL}s"
    LAST_BUILD_OK=0
  fi
done

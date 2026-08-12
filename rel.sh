#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if ! command -v php >/dev/null 2>&1; then
  echo "error: php not found in PATH" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "error: pnpm not found in PATH" >&2
  exit 1
fi

# Release build: no dev.php fragment, no ?module=dev endpoint.
# Outputs the single-file artifact as dist/sfpb.php.
php build.php release

#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .uwazi/uwazi.pid ]]; then
  kill "$(cat .uwazi/uwazi.pid)" 2>/dev/null || true
  rm -f .uwazi/uwazi.pid
fi

docker compose -f docker/compose.yml down -v 2>/dev/null || true
echo "ci stack stopped"

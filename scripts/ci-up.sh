#!/usr/bin/env bash
# Start dockerized Uwazi deps + official release tarball, then seed poll schema/pages.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

UWAZI_DIR="${ROOT}/.uwazi"
RELEASE_URL="${UWAZI_RELEASE_URL:-https://github.com/huridocs/uwazi/releases/latest/download/uwazi.tgz}"
DB_NAME="${DATABASE_NAME:-uwazi_polls_ci}"

export DATABASE_NAME="$DB_NAME"
export INDEX_NAME="${INDEX_NAME:-$DB_NAME}"
export NODE_ENV=production
# Uwazi app config wants a hostname (it prefixes mongodb://). Do NOT set a bare IP as a
# mongodb:// URI here — yarn blank-state → scripts/bash.js parses DBHOST with `new URL`.
export DBHOST="${DBHOST:-127.0.0.1}"
export ELASTICSEARCH_URL="${ELASTICSEARCH_URL:-http://127.0.0.1:9200}"
export REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
export REDIS_PORT="${REDIS_PORT:-6379}"
export FILES_ROOT_PATH="${FILES_ROOT_PATH:-$UWAZI_DIR}"
export POLL_BASE_URL="${POLL_BASE_URL:-http://127.0.0.1:3000}"
export POLL_USERNAME="${POLL_USERNAME:-admin}"
export POLL_PASSWORD="${POLL_PASSWORD:-change this password now}"

mkdir -p "$UWAZI_DIR"/{log,uploaded_documents,custom_uploads,temporal_files}

echo "==> docker compose up"
docker compose -f docker/compose.yml up -d

echo "==> waiting for elasticsearch"
for i in $(seq 1 60); do
  if curl -fsS "$ELASTICSEARCH_URL" >/dev/null 2>&1; then
    echo "elasticsearch ready"
    break
  fi
  sleep 2
  if [[ "$i" -eq 60 ]]; then
    echo "elasticsearch did not become ready"
    exit 1
  fi
done

echo "==> waiting for mongo replica set"
for i in $(seq 1 60); do
  if docker compose -f docker/compose.yml exec -T mongo \
    mongosh --quiet --eval 'try { quit(rs.status().ok === 1 ? 0 : 1) } catch (e) { quit(1) }' \
    >/dev/null 2>&1; then
    echo "mongo replica ready"
    break
  fi
  # re-run init if needed
  docker compose -f docker/compose.yml up mongo-init >/dev/null 2>&1 || true
  sleep 2
  if [[ "$i" -eq 60 ]]; then
    echo "mongo replica did not become ready"
    exit 1
  fi
done

if [[ ! -d "$UWAZI_DIR/latest" ]]; then
  echo "==> downloading Uwazi release"
  curl -fsSL "$RELEASE_URL" -o "$UWAZI_DIR/uwazi.tgz"
  tar -xzf "$UWAZI_DIR/uwazi.tgz" -C "$UWAZI_DIR"
  if [[ -d "$UWAZI_DIR/prod" ]]; then
    mv "$UWAZI_DIR/prod" "$UWAZI_DIR/latest"
  fi
  rm -f "$UWAZI_DIR/uwazi.tgz"
fi

echo "==> blank-state ($DB_NAME)"
# scripts/bash.js does `new URL(DBHOST)` and defaults to mongodb://127.0.0.1/
# when unset. A bare hostname/IP is an Invalid URL. Unset for this step only.
(
  cd "$UWAZI_DIR/latest"
  env -u DBHOST yarn blank-state "$DB_NAME"
)

echo "==> starting Uwazi"
(
  cd "$UWAZI_DIR/latest"
  # Server config treats DBHOST as hostname (mongodb://${DBHOST}/).
  nohup node --no-experimental-fetch server.js >"$UWAZI_DIR/log/server.log" 2>&1 &
  echo $! >"$UWAZI_DIR/uwazi.pid"
)

echo "==> waiting for HTTP"
for i in $(seq 1 90); do
  if curl -fsS "$POLL_BASE_URL/api/settings" >/dev/null 2>&1; then
    echo "Uwazi is up"
    break
  fi
  sleep 2
  if [[ "$i" -eq 90 ]]; then
    echo "Uwazi did not become ready; last log lines:"
    tail -n 80 "$UWAZI_DIR/log/server.log" || true
    exit 1
  fi
done

echo "==> seed poll schema + pages"
yarn seed

echo "ci-up complete"

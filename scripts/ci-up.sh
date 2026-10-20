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
# Match docker/compose.yml Postgres (superuser admin/admin). Official Uwazi defaults
# to migrator_user/app_user via provisioning SQL we do not mount in CI.
export POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
export POSTGRES_PORT="${POSTGRES_PORT:-5432}"
export POSTGRES_DB="${POSTGRES_DB:-uwazi_development}"
export POSTGRES_USER="${POSTGRES_USER:-admin}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-admin}"
export POSTGRES_APP_USER="${POSTGRES_APP_USER:-admin}"
export POSTGRES_APP_PASSWORD="${POSTGRES_APP_PASSWORD:-admin}"

mkdir -p "$UWAZI_DIR"/{log,uploaded_documents,custom_uploads,temporal_files}

ensure_mongo_cli() {
  local arch host_arch tools_arch mongosh_arch
  host_arch="$(uname -m)"
  case "$host_arch" in
    x86_64)
      tools_arch=x86_64
      mongosh_arch=x64
      ;;
    aarch64|arm64)
      tools_arch=arm64
      mongosh_arch=arm64
      ;;
    *)
      echo "unsupported arch for mongodb cli: $host_arch"
      exit 1
      ;;
  esac

  local bin_dir="$UWAZI_DIR/mongodb-cli/bin"
  mkdir -p "$bin_dir"
  export PATH="$bin_dir:$PATH"

  if ! command -v mongorestore >/dev/null 2>&1; then
    echo "==> installing MongoDB Database Tools (mongorestore)"
    local tools_ver="${MONGODB_TOOLS_VERSION:-100.12.0}"
    local tools_dist="mongodb-database-tools-ubuntu2204-${tools_arch}-${tools_ver}"
    local tools_url="https://fastdl.mongodb.org/tools/db/${tools_dist}.tgz"
    local tools_dest="$UWAZI_DIR/mongodb-cli/tools"
    mkdir -p "$tools_dest"
    curl -fsSL "$tools_url" -o "$tools_dest/tools.tgz"
    tar -xzf "$tools_dest/tools.tgz" -C "$tools_dest" --strip-components=1
    ln -sfn "$tools_dest/bin/"* "$bin_dir/"
  fi

  if ! command -v mongosh >/dev/null 2>&1; then
    echo "==> installing mongosh"
    local sh_ver="${MONGOSH_VERSION:-2.5.0}"
    local sh_dist="mongosh-${sh_ver}-linux-${mongosh_arch}"
    local sh_url="https://downloads.mongodb.com/compass/${sh_dist}.tgz"
    local sh_dest="$UWAZI_DIR/mongodb-cli/mongosh"
    mkdir -p "$sh_dest"
    curl -fsSL "$sh_url" -o "$sh_dest/mongosh.tgz"
    tar -xzf "$sh_dest/mongosh.tgz" -C "$sh_dest" --strip-components=1
    # tarball layout: bin/mongosh
    ln -sfn "$sh_dest/bin/mongosh" "$bin_dir/mongosh"
  fi

  command -v mongorestore >/dev/null
  command -v mongosh >/dev/null
  echo "mongorestore at $(command -v mongorestore)"
  echo "mongosh at $(command -v mongosh)"
}

ensure_mongo_cli

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

echo "==> Postgres schema (yarn migrate --new)"
# Classic blank-state only runs Mongo `yarn migrate`. PG tables (captchas,
# password_recoveries, activitylogs, …) are applied by the --new MigrationJob /
# PgMigrator path. Without this, queue workers spam missing-relation errors and
# HTTP readiness can fail.
(
  cd "$UWAZI_DIR/latest"
  yarn migrate --new
)

echo "==> starting Uwazi"
(
  cd "$UWAZI_DIR/latest"
  # Server config treats DBHOST as hostname (mongodb://${DBHOST}/).
  nohup node --no-experimental-fetch server.js >"$UWAZI_DIR/log/server.log" 2>&1 &
  echo $! >"$UWAZI_DIR/uwazi.pid"
)

echo "==> waiting for HTTP"
# /api/settings can return 401 on a private instance; any HTTP response means the
# process is listening. Connection refused / empty code means still starting.
for i in $(seq 1 90); do
  code="$(curl -sS -o /tmp/uwazi-health.out -w '%{http_code}' "$POLL_BASE_URL/api/settings" || true)"
  if [[ "$code" =~ ^[12345][0-9][0-9]$ ]]; then
    echo "Uwazi is up (HTTP $code)"
    break
  fi
  sleep 2
  if [[ "$i" -eq 90 ]]; then
    echo "Uwazi did not become ready (last HTTP '${code:-none}'); body:"
    head -c 500 /tmp/uwazi-health.out || true
    echo
    echo "last log lines:"
    tail -n 80 "$UWAZI_DIR/log/server.log" || true
    exit 1
  fi
done

echo "==> seed poll schema + pages"
yarn seed

echo "ci-up complete"

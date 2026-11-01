#!/usr/bin/env bash
# Isolated demo environment: DB bfinance_demo, API :3100, Vite :5174. Never touches dev data/servers.
# Usage: demo-env.sh start|stop|reset|status
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
RUN="$ROOT/marketing/video/.demo-run"; mkdir -p "$RUN"
PG=slama-finance-postgres-1
PW_OWNER=$(grep '^MIGRATION_DATABASE_URL' "$ROOT/api/.env" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
PW_APP=$(grep '^DATABASE_URL' "$ROOT/api/.env" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
export MIGRATION_DATABASE_URL="postgres://slama:$PW_OWNER@127.0.0.1:5433/bfinance_demo"
export DATABASE_URL="postgres://slama_app:$PW_APP@127.0.0.1:5433/bfinance_demo"
demo_env() {
  export NODE_ENV=development PORT=3100 HOST=127.0.0.1 PLATFORM_DOMAIN=localhost:5174 PLATFORM_SCHEME=http
  export NOTIFICATION_TRANSPORT=smtp SMTP_HOST=127.0.0.1 SMTP_PORT=1025 OWNER_AUTH_ENABLED=true
  export ADMIN_TOTP_KEY="$(printf '0123456789abcdef0123456789abcdef' | base64)"
  export MEDIA_ASSET_DIR="$RUN/media" S3_ENDPOINT= S3_BUCKET= S3_ACCESS_KEY_ID= S3_SECRET_ACCESS_KEY=
  export LOG_LEVEL=warn RATE_LIMIT_MAX=10000 SESSION_TTL_DAYS=30
}
case "${1:-}" in
  init) # create DB if missing and initialise schema
    docker exec $PG psql -U slama -d postgres -tc "select 1 from pg_database where datname='bfinance_demo'" | grep -q 1 \
      || docker exec $PG psql -U slama -d postgres -c "create database bfinance_demo owner slama"
    (cd "$ROOT" && node api/scripts/initialize-database.mjs) ;;
  reset) # drop and recreate DB (demo DB only)
    "$0" stop || true
    docker exec $PG psql -U slama -d postgres -c "drop database if exists bfinance_demo with (force)"
    docker exec $PG psql -U slama -d postgres -c "create database bfinance_demo owner slama"
    rm -rf "$RUN/media"
    (cd "$ROOT" && node api/scripts/initialize-database.mjs) ;;
  fresh) # reset DB and start both servers, waiting until ready
    "$0" reset >/dev/null; "$0" start >/dev/null
    for i in $(seq 60); do curl -sf -H 'Host: app.localhost:5174' http://localhost:5174/api/v1/public/site >/dev/null && break; sleep 1; done; echo ready ;;
  snapshot) # snapshot NAME: save demo DB as template bfinance_demo_NAME (servers restarted)
    "$0" stop; N="bfinance_demo_$2"
    docker exec $PG psql -U slama -d postgres -c "drop database if exists $N with (force)" -c "create database $N template bfinance_demo owner slama"
    "$0" start; "$0" wait ;;
  restore) # restore NAME: replace demo DB by snapshot
    "$0" stop; N="bfinance_demo_$2"
    docker exec $PG psql -U slama -d postgres -c "drop database if exists bfinance_demo with (force)" -c "create database bfinance_demo template $N owner slama"
    "$0" start; "$0" wait ;;
  wait) for i in $(seq 90); do curl -sf -H 'Host: app.localhost:5174' http://localhost:5174/api/v1/public/site >/dev/null && { echo ready; exit 0; }; sleep 1; done; exit 1 ;;
  start)
    demo_env
    (cd "$ROOT/api" && nohup npx tsx src/server.ts > "$RUN/api.log" 2>&1 < /dev/null & echo $! > "$RUN/api.pid")
    (cd "$ROOT/ui" && VITE_API_PROXY_TARGET=http://localhost:3100 VITE_PLATFORM_DOMAIN=localhost:5174 nohup npx vite --port 5174 --strictPort > "$RUN/ui.log" 2>&1 < /dev/null & echo $! > "$RUN/ui.pid")
    echo "API :3100 and UI :5174 starting (logs in $RUN)" ;;
  stop)
    for s in api ui; do
      rm -f "$RUN/$s.pid"
    done
    lsof -ti tcp:3100 | xargs kill 2>/dev/null || true; lsof -ti tcp:5174 | xargs kill 2>/dev/null || true; sleep 1; true ;;
  env) demo_env; env | grep -E '^(DATABASE_URL|MIGRATION_DATABASE_URL|PORT|PLATFORM_|SMTP|MEDIA_ASSET_DIR|ADMIN_TOTP_KEY)=' ;;
  *) echo "usage: $0 init|reset|fresh|snapshot N|restore N|wait|start|stop|env"; exit 1 ;;
esac

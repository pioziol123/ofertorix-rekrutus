#!/bin/sh
# Run every test, integration included, inside the agent sandbox image.
# Starts the image's PostgreSQL, applies pending migrations, builds the app,
# runs the web server and the worker in the background, runs the tests and
# always stops what it started. Expects PGDATA and DATABASE_URL from the image.
set -eu

log_dir=${TMPDIR:-/tmp}/test-integration
mkdir -p "$log_dir"
pids=''

cleanup() {
  for pid in $pids; do kill "$pid" 2>/dev/null || true; done
  pg_ctl --mode=fast stop >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

pg_ctl --wait --options="-k /tmp -c listen_addresses=localhost" --log="$log_dir/postgres.log" start
pnpm migrate
pnpm build

PORT=3000 node .output/server/index.mjs >"$log_dir/web.log" 2>&1 &
pids="$pids $!"
DOCUMENTS_DIR="$log_dir/documents" pnpm worker >"$log_dir/worker.log" 2>&1 &
pids="$pids $!"

ready=''
for _ in $(seq 1 60); do
  if curl -fsS http://localhost:3000/api/health/ready >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ -z "$ready" ]; then
  echo "web server did not become ready; see $log_dir/web.log" >&2
  tail -20 "$log_dir/web.log" >&2
  exit 1
fi

WEB_BASE_URL=http://localhost:3000 RUN_INTEGRATION=1 DOCUMENTS_DIR="$log_dir/documents" pnpm test

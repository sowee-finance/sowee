#!/usr/bin/env bash
# Bring the demo stack up against Hedera testnet: the Go API and the web app, with the
# environment they need. Reads .env.demo at the repo root (gitignored — it holds keys).
#
#   scripts/demo.sh up      build and start both, wait until they answer, print the links
#   scripts/demo.sh down    stop them
#   scripts/demo.sh status  who is listening and what the API reports
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
env_file="$root/.env.demo"
api_port=${API_PORT:-8080}
web_port=${WEB_PORT:-3000}
api_bin=${API_BIN:-/tmp/sowee-demo-api}
log_dir=${LOG_DIR:-/tmp}

die() { echo "error: $*" >&2; exit 1; }

load_env() {
  [ -f "$env_file" ] || die "$env_file not found — copy .env.demo.example and fill it in"
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
  : "${DISCOUNT_ORACLE:?set in .env.demo}" "${INVOICE_MARKET:?set in .env.demo}" "${QUOTE_SIGNER_PK:?set in .env.demo}"
}

wait_for() { # url, seconds
  for _ in $(seq 1 "${2:-45}"); do
    curl -sf "$1" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

stop_port() {
  local pids
  pids=$(lsof -ti "tcp:$1" 2>/dev/null || true)
  [ -n "$pids" ] && kill $pids 2>/dev/null || true
}

up() {
  load_env
  # A dedicated binary path: rebuilding over a running binary kills the process it is serving.
  echo "building the api…"
  (cd "$root/apps/api" && go build -o "$api_bin" ./cmd/api)

  stop_port "$api_port"
  echo "starting the api on :${api_port}…"
  ( cd "$root/apps/api" && PORT="$api_port" CHAIN_ID="${CHAIN_ID:-296}" \
      WEB_ORIGIN="${WEB_ORIGIN:-http://localhost:$web_port}" nohup "$api_bin" \
      > "$log_dir/sowee-demo-api.log" 2>&1 & )
  wait_for "http://localhost:$api_port/v1/healthz" || die "the api did not come up — see $log_dir/sowee-demo-api.log"

  echo "building the web…"
  ( cd "$root/apps/web" \
    && NEXT_PUBLIC_CHAIN_ID="${CHAIN_ID:-296}" \
       NEXT_PUBLIC_API_URL="http://localhost:$api_port" \
       NEXT_PUBLIC_WORLD_APP_ID="${WORLD_APP_ID:-}" \
       bun run build >"$log_dir/sowee-demo-web-build.log" 2>&1 ) || die "web build failed — see $log_dir/sowee-demo-web-build.log"

  stop_port "$web_port"
  echo "starting the web on :${web_port}…"
  ( cd "$root/apps/web" \
    && NEXT_PUBLIC_CHAIN_ID="${CHAIN_ID:-296}" \
       NEXT_PUBLIC_API_URL="http://localhost:$api_port" \
       NEXT_PUBLIC_WORLD_APP_ID="${WORLD_APP_ID:-}" \
       nohup bun run start -p "$web_port" >"$log_dir/sowee-demo-web.log" 2>&1 & )
  wait_for "http://localhost:$web_port/" || die "the web app did not come up — see $log_dir/sowee-demo-web.log"

  status
}

down() {
  stop_port "$api_port"
  stop_port "$web_port"
  echo "stopped"
}

status() {
  local health
  health=$(curl -s "http://localhost:$api_port/v1/healthz" 2>/dev/null || true)
  echo
  echo "  marketplace   http://localhost:$web_port"
  echo "  kyc wizard    http://localhost:$web_port/kyc"
  echo "  api           http://localhost:$api_port/v1/healthz  ${health:-(not answering)}"
  [ -n "${INVOICE_MARKET:-}" ] && echo "  market        https://hashscan.io/testnet/contract/$INVOICE_MARKET"
  [ -n "${HCS_TOPIC_ID:-}" ] && echo "  audit trail   https://hashscan.io/testnet/topic/$HCS_TOPIC_ID"
  echo "  agent         cd apps/agent && bun run src/index.ts --execute 1"
  echo
}

case "${1:-up}" in
  up) up ;;
  down) down ;;
  status) load_env 2>/dev/null || true; status ;;
  *) die "usage: scripts/demo.sh [up|down|status]" ;;
esac

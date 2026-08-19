#!/usr/bin/env bash
# Run the whole local stack in one terminal.
#
#   ./scripts/dev-start.sh
#
#   api    http://localhost:7071   Azure Functions
#   web    http://localhost:5173   public site
#   admin  http://localhost:5174   backoffice
#
# Assumes ./scripts/dev-up.sh has been run at least once. If any process exits, the
# others are stopped too, so a half-running stack never masks a failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

cd "$ROOT_DIR"

[[ -f .env ]] || die "Workspace not bootstrapped — run ./scripts/dev-up.sh first."
[[ -f api/local.settings.json ]] || die "api/local.settings.json is missing — run ./scripts/dev-up.sh first."

docker inspect -f '{{.State.Running}}' lehub-sql 2>/dev/null | grep -q true \
  || warn "The SQL container is not running — start it with ./scripts/dev-up.sh, or the API will fail to read events."

# Taken from api/node_modules so nothing has to be installed globally.
CONCURRENTLY="$ROOT_DIR/api/node_modules/.bin/concurrently"
[[ -x "$CONCURRENTLY" ]] || die "concurrently not found — run ./scripts/dev-up.sh to install dependencies."

PORTS=(7071 5173 5174)

for port in "${PORTS[@]}"; do
  if lsof -ti:"$port" >/dev/null 2>&1; then
    die "Port $port is already in use. Stop the process holding it, or close a previous ./scripts/dev-start.sh."
  fi
done

# Anything still listening once concurrently returns is an orphan: npm spawns each
# tool as a child of its own, so killing the npm wrapper does not always take the
# tool with it. Reaping by port is the only reliable way back to a clean slate.
cleanup() {
  for port in "${PORTS[@]}"; do
    # shellcheck disable=SC2046  # word splitting is intended: possibly several pids
    kill $(lsof -ti:"$port" 2>/dev/null) 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

# Two things this layout works around:
#
#  - tsc and func run side by side here rather than through api's own `dev` script,
#    because nesting a second concurrently inside this one orphans the Functions
#    host when the outer one tears the stack down;
#  - `func start` does not stop on SIGTERM — it restarts its language worker instead,
#    so concurrently would wait on it forever and this script would never reach its
#    cleanup. `exec` makes func the direct child, and SIGKILL cannot be ignored.
"$CONCURRENTLY" \
  --names "tsc,api,web,admin" \
  --prefix-colors "gray,magenta,cyan,yellow" \
  --kill-others-on-fail \
  --kill-signal SIGKILL \
  "npm --prefix api run watch" \
  "cd api && exec func start" \
  "npm --prefix frontend/lehub.ms run dev" \
  "npm --prefix frontend/admin.lehub.ms run dev"

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

for port in "${DEV_PORTS[@]}"; do
  if lsof -ti:"$port" >/dev/null 2>&1; then
    die "Port $port is already in use. Run ./scripts/dev-down.sh, or stop whatever else is holding it."
  fi
done

# Anything still listening once concurrently returns is an orphan — see
# stop_dev_processes in lib/common.sh for why signalling the wrappers is not enough.
trap stop_dev_processes EXIT INT TERM

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

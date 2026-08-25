#!/usr/bin/env bash
# Run the whole local stack in one terminal.
#
#   ./scripts/dev-start.sh
#
# The three services listen on this workspace's own ports: slot 0 — the main clone — keeps
# 7071, 5173 and 5174, and each further worktree shifts by a hundred. The banner below
# prints the numbers this working tree got.
#
# Assumes ./scripts/dev-up.sh has been run at least once. If any process exits, the others
# are stopped too, so a half-running stack never masks a failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

cd "$ROOT_DIR"

workspace_resolve
info "Workspace slot $LEHUB_SLOT — api $LEHUB_API_PORT, web $LEHUB_WEB_PORT, admin $LEHUB_ADMIN_PORT"

# Taken from api/node_modules so nothing has to be installed globally. Its absence is also
# the honest test for "never bootstrapped": the environment files below are rendered, so
# their presence proves nothing.
CONCURRENTLY="$ROOT_DIR/api/node_modules/.bin/concurrently"
[[ -x "$CONCURRENTLY" ]] || die "concurrently not found — run ./scripts/dev-up.sh first."

# Rendered on every start, not only at bootstrap: the API's CORS allow-list, the origin each
# front-end calls and the port each Vite server binds all have to agree with this slot. A
# file written before this workspace existed, or inherited from the slot's previous
# occupant, would otherwise point silently at another worktree's API.
workspace_render_env

container_running lehub-sql \
  || warn "The shared SQL container is not running — start it with ./scripts/dev-up.sh, or the API will fail to read events."

# A warning, not a failure: without the emulator the pages still render, every image
# just falls back to its colour placeholder.
container_running lehub-azurite \
  || warn "The shared Azurite container is not running — start it with ./scripts/dev-up.sh, or logos and banners will not load."

# Only this workspace's ports, and the message says who is holding one: another LeHub
# worktree is a different problem from a stray process, and the number alone does not tell.
for port in "${DEV_PORTS[@]}"; do
  if [[ -n "$(port_listeners "$port")" ]]; then
    die "Port $port is held by $(workspace_describe_port_holder "$port")
  This workspace needs ${DEV_PORTS[*]}."
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
#
# Vite reads its port and its host from the rendered .env.local; the Functions host takes
# --port because it has no equivalent file.
"$CONCURRENTLY" \
  --names "tsc,api,web,admin" \
  --prefix-colors "gray,magenta,cyan,yellow" \
  --kill-others \
  --kill-signal SIGKILL \
  "npm --prefix api run watch" \
  "cd api && exec func start --port $LEHUB_API_PORT" \
  "npm --prefix frontend/lehub.ms run dev" \
  "npm --prefix frontend/admin.lehub.ms run dev"

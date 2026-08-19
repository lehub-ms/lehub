#!/usr/bin/env bash
# Stop the local LeHub stack.
#
#   ./scripts/dev-down.sh             stop everything, keep the data
#   ./scripts/dev-down.sh --volumes   stop everything and delete the data
#
# The exact inverse of dev-up.sh: it stops the API and both web applications, then
# the database. Stopping only the container would leave the applications running
# against a database that no longer exists.
#
# --volumes is the way back to a pristine database. It is also the fix for a
# container stuck unhealthy on "Login failed for user 'sa'" after the password
# changed in .env: SQL Server only applies MSSQL_SA_PASSWORD when it initialises an
# empty data directory.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

cd "$ROOT_DIR"

usage() { sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

WIPE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -v|--volumes) WIPE=true; shift ;;
    *) usage >&2; die "Unexpected argument '$1'" ;;
  esac
done

# Applications first: they hold connections to the database.
running=()
for port in "${DEV_PORTS[@]}"; do
  [[ -n "$(port_listeners "$port")" ]] && running+=("$port")
done

if [[ ${#running[@]} -gt 0 ]]; then
  info "Stopping the local processes (ports ${running[*]})"
  stop_dev_processes
  ok "API and web applications stopped"
else
  dim "No local process listening — nothing to stop"
fi

if [[ "$WIPE" == true ]]; then
  info "Stopping SQL Server and deleting its data"
  docker compose down --volumes
  ok "Stack down, volume removed — ./scripts/dev-up.sh will rebuild the database"
else
  info "Stopping SQL Server"
  docker compose down
  ok "Stack down — the data volume is kept"
  dim "Add --volumes to start from an empty database."
fi

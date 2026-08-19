#!/usr/bin/env bash
# Stop the local LeHub database.
#
#   ./scripts/dev-down.sh             stop the container, keep the data
#   ./scripts/dev-down.sh --volumes   stop and delete the data volume
#
# --volumes is the way back to a pristine database: SQL Server only applies
# MSSQL_SA_PASSWORD when it initialises an empty data directory, so it is also the
# fix for a container stuck unhealthy on "Login failed for user 'sa'" after the
# password changed in .env.
#
# It does not stop the API or the front-ends; those live in the terminal running
# ./scripts/dev-start.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

cd "$ROOT_DIR"

usage() { sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

WIPE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -v|--volumes) WIPE=true; shift ;;
    *) usage >&2; die "Unexpected argument '$1'" ;;
  esac
done

if [[ "$WIPE" == true ]]; then
  info "Stopping SQL Server and deleting its data"
  docker compose down --volumes
  ok "Container and volume removed — ./scripts/dev-up.sh will rebuild the database"
else
  info "Stopping SQL Server"
  docker compose down
  ok "Container stopped — the data volume is kept"
  dim "Add --volumes to start from an empty database."
fi

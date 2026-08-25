#!/usr/bin/env bash
# Stop the local LeHub stack.
#
#   ./scripts/dev-down.sh              stop this workspace's processes
#   ./scripts/dev-down.sh --sql        also stop the shared containers, keeping the data
#   ./scripts/dev-down.sh --drop-db    also drop this workspace's database
#   ./scripts/dev-down.sh --volumes    also delete the volumes — every workspace's data
#
# SQL Server and Azurite are shared by every workspace on this machine, so stopping them is
# opt-in: without --sql this ends only what this working tree started, and the other
# worktrees keep running against an instance that never went away.
#
# --volumes is the way back to a pristine instance and an empty media container. It is also
# the only fix once the shared SA password is lost: SQL Server applies MSSQL_SA_PASSWORD
# solely when it initialises an empty data directory.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

cd "$ROOT_DIR"

usage() { sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

STOP_SQL=false
DROP_DB=false
WIPE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --sql) STOP_SQL=true; shift ;;
    --drop-db) DROP_DB=true; shift ;;
    # Deleting the volume implies the containers go with it.
    -v|--volumes) WIPE=true; STOP_SQL=true; shift ;;
    *) usage >&2; die "Unexpected argument '$1'" ;;
  esac
done

# Also purges registry entries whose working tree is gone — `git worktree remove` leaves one
# behind, and an orphan would hold a slot for nothing.
workspace_resolve
dim "Workspace: slot $LEHUB_SLOT, database $LEHUB_DB_NAME"

# Applications first: they hold connections to the database.
running=()
for port in "${DEV_PORTS[@]}"; do
  [[ -n "$(port_listeners "$port")" ]] && running+=("$port")
done

if [[ ${#running[@]} -gt 0 ]]; then
  info "Stopping this workspace's processes (ports ${running[*]})"
  stop_dev_processes
  ok "API and web applications stopped"
else
  dim "No process of this workspace listening — nothing to stop"
fi

if [[ "$DROP_DB" == true && "$WIPE" == true ]]; then
  dim "--volumes deletes every database already; --drop-db adds nothing"
elif [[ "$DROP_DB" == true ]]; then
  if ! container_running lehub-sql; then
    dim "SQL Server is not running — start it to drop $LEHUB_DB_NAME"
  else
    sql_configure local
    if instance_db_exists "$LEHUB_DB_NAME"; then
      info "Dropping database $LEHUB_DB_NAME"
      instance_db_drop "$LEHUB_DB_NAME"
      ok "Database $LEHUB_DB_NAME dropped — ./scripts/dev-up.sh will recreate it"
    else
      dim "Database $LEHUB_DB_NAME is not on the instance — nothing to drop"
    fi
  fi
fi

if [[ "$WIPE" == true ]]; then
  # The volume is shared, so this is never "this workspace's data". Say so, and make the
  # contributor say yes, whenever another workspace has a database on the instance.
  if container_running lehub-sql; then
    sql_configure local
    databases="$(instance_list_dbs || true)"
    # grep -c, not `wc -l`: the captured output has no trailing newline, so wc would count
    # one line fewer and the confirmation below would never fire on exactly two databases.
    count="$(printf '%s' "$databases" | grep -c . || true)"
    if [[ "$count" -gt 1 ]]; then
      warn "The shared instance holds $count LeHub databases:"
      printf '%s\n' "$databases" | sed 's/^/    /'
      dim "--volumes deletes the volume, so all of them go — not just $LEHUB_DB_NAME."
      [[ -t 0 ]] || die "Refusing to delete $count databases without a terminal to confirm on."
      read -r -p "  Type 'yes' to delete every LeHub database: " confirmation
      [[ "$confirmation" == "yes" ]] || die "Aborted — nothing was deleted."
    fi
  fi

  info "Stopping SQL Server and Azurite, and deleting their data"
  compose down --volumes
  ok "Stack down, volumes removed — ./scripts/dev-up.sh will rebuild the database and the media"
elif [[ "$STOP_SQL" == true ]]; then
  info "Stopping SQL Server and Azurite"
  compose down
  ok "Containers down — the data volumes are kept"
  dim "Every workspace on this machine shared them; ./scripts/dev-up.sh brings them back."
else
  dim "SQL Server and Azurite left running — they are shared with every workspace."
  dim "Add --sql to stop them, --drop-db to drop $LEHUB_DB_NAME, --volumes to wipe everything."
fi

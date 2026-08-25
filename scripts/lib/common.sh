#!/usr/bin/env bash
# Shared helpers for the LeHub scripts. Source it, do not execute it:
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

# ─── Repository root ─────────────────────────────────────────────────────────
# Resolved from this file's own location, so every script works from any cwd.
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$LIB_DIR/../.." && pwd)"
export ROOT_DIR

# ─── Output ──────────────────────────────────────────────────────────────────
# Colours only when stdout is a terminal, so CI logs stay clean.
if [[ -t 1 ]]; then
  _C_RESET=$'\033[0m'; _C_DIM=$'\033[2m'; _C_RED=$'\033[31m'
  _C_GREEN=$'\033[32m'; _C_YELLOW=$'\033[33m'; _C_BLUE=$'\033[34m'
else
  _C_RESET=''; _C_DIM=''; _C_RED=''; _C_GREEN=''; _C_YELLOW=''; _C_BLUE=''
fi

info() { printf '%s▶%s %s\n' "$_C_BLUE" "$_C_RESET" "$*"; }
ok()   { printf '%s✓%s %s\n' "$_C_GREEN" "$_C_RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$_C_YELLOW" "$_C_RESET" "$*" >&2; }
dim()  { printf '%s  %s%s\n' "$_C_DIM" "$*" "$_C_RESET"; }
die()  { printf '%s✗%s %s\n' "$_C_RED" "$_C_RESET" "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required but not on PATH. $2"
}

# SHA-256 of a file, hex, lowercase. macOS ships shasum, Linux runners sha256sum.
sha256_of() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

# ─── Workspaces ──────────────────────────────────────────────────────────────
# Slot, slug and database of the current working tree, plus the shared SQL instance
# password. Sourced here so every script gets it from the one `source lib/common.sh` it
# already does.
# shellcheck source=workspace.sh
source "$LIB_DIR/workspace.sh"

# ─── Local processes ─────────────────────────────────────────────────────────
# The ports the local stack listens on, in the order dev-start.sh names them. Set by
# workspace_resolve rather than fixed here: they derive from the workspace's slot, so every
# check and every kill below reaches this working tree's processes and no other's.

# PIDs listening on a port. `-sTCP:LISTEN` is essential: without it lsof also matches
# every *client* of that port, so a browser holding Vite's HMR websocket on 5173 would
# be reported — and killed.
port_listeners() {
  lsof -ti:"$1" -sTCP:LISTEN 2>/dev/null || true
}

# Stop whatever is listening on those ports.
#
# Killing by port rather than by pid tree is deliberate: npm spawns each tool as a
# child of its own, and `func start` ignores SIGTERM — it restarts its language
# worker instead of exiting. Signalling the wrapper is therefore not enough.
stop_dev_processes() {
  local port pids stopped=0
  for port in "${DEV_PORTS[@]}"; do
    pids="$(port_listeners "$port")"
    [[ -n "$pids" ]] || continue
    # shellcheck disable=SC2086  # word splitting is intended: possibly several pids
    kill $pids 2>/dev/null || true
    stopped=$((stopped + 1))
  done

  # Give them a moment to go down on their own, then insist.
  if [[ $stopped -gt 0 ]]; then
    sleep 2
    for port in "${DEV_PORTS[@]}"; do
      pids="$(port_listeners "$port")"
      [[ -n "$pids" ]] || continue
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    done
  fi

  return 0
}

# ─── Containers ──────────────────────────────────────────────────────────────
# One SQL Server instance and one Azurite instance are shared by every workspace, so the
# Compose project stays `lehub` with its fixed container names, ports and volumes.
#
# The password reaches Compose through the environment rather than through the workspace's
# .env: the shell environment wins over .env in Compose's interpolation, which makes the
# shared store the single source whatever a stale .env happens to hold.
compose() {
  local password

  # Tearing down has to work even when the password is unrecoverable — `--volumes` is the
  # documented way out of exactly that situation, and demanding the password first made the
  # escape hatch unreachable. Compose interpolates the whole file whatever the command, so
  # it still needs *a* value; only the commands that start a container care which one.
  case "${1:-}" in
    up|start|restart|run)
      password="$(workspace_sa_password)"
      # No fallback on this branch, ever. SQL Server bakes MSSQL_SA_PASSWORD in when it
      # initialises an empty data directory and never again, so starting with a placeholder
      # would leave a container permanently unhealthy on "Login failed for user 'sa'" while
      # .env and api/local.settings.json carry something else — the exact failure this file
      # exists to prevent, made silent.
      [[ -n "$password" ]] || die "The shared SA password resolved to an empty value.
  Check $(workspace_state_dir)/sa-password, or start from an empty database:
  ./scripts/dev-down.sh --volumes, then rerun."
      ;;
    *)
      # Teardown has to work without it. Compose interpolates the whole file whatever the
      # command, so it needs *a* value; nothing reads it as the container goes away.
      password="$(workspace_sa_password_if_known || true)"
      password="${password:-unused-for-teardown}"
      ;;
  esac

  # Still a prefix assignment, but of an already-resolved variable. The lookup happens above
  # in a plain assignment, whose declaration is separate from it — `local password="$(...)"`
  # would mask the status the same way a prefix assignment does — so a `die` in there stops
  # the script instead of letting docker compose run with an empty password and fail on a
  # message pointing at a .env that is no longer the source of it.
  MSSQL_SA_PASSWORD="$password" \
    docker compose -f "$ROOT_DIR/docker-compose.yml" "$@"
}

container_running() {
  [[ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" == "true" ]]
}

# True when both shared containers are up, so a bootstrap can leave a running instance
# alone instead of recreating it under another workspace's feet.
instance_running() {
  container_running lehub-sql && container_running lehub-azurite
}


# Refuse to start a container whose published port is already taken by something
# else, with a message naming both. Without this the failure surfaces as Docker's
# raw "bind: address already in use", which says nothing about what to stop.
#
# Skipped when the container itself is already running: it is then the legitimate
# holder of the port, and re-running dev-up.sh must stay a no-op.
assert_container_port_free() {
  local container="$1" port="$2"

  container_running "$container" && return 0
  [[ -z "$(port_listeners "$port")" ]] && return 0

  die "Port $port is needed by the $container container but something else is holding it.
  Identify it with: lsof -i:$port -sTCP:LISTEN
  Stop that process, or stop a previous stack with ./scripts/dev-down.sh, then retry."
}

# Ask before something irreversible, and refuse outright with no terminal to ask on. Shared
# by every branch of dev-down.sh --volumes so none of them can quietly skip the question.
confirm_destruction() {
  local prompt="$1" no_tty_message="$2" answer
  [[ -t 0 ]] || die "$no_tty_message"
  read -r -p "  $prompt" answer
  [[ "$answer" == "yes" ]] || die "Aborted — nothing was deleted."
}

# Block until a container reports healthy, or give up with a diagnostic.
#
# Reads the container's own healthcheck rather than probing the port from here: the
# port is published as soon as Docker binds it, well before the service behind it
# answers, and a bootstrap that continues at that point fails further down with a
# far less obvious error.
wait_for_healthy() {
  local container="$1" label="$2" diagnostic="$3"
  local attempt status

  printf '  waiting for %s to report healthy' "$label"
  for attempt in $(seq 1 30); do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || echo starting)"
    [[ "$status" == "healthy" ]] && { printf '\n'; return 0; }
    if [[ $attempt -eq 30 ]]; then
      printf '\n'
      die "$label did not become healthy within 150s (last status: $status).
$diagnostic"
    fi
    printf '.'
    sleep 5
  done
}

# ─── Media storage ───────────────────────────────────────────────────────────
# The emulator's fixed account endpoint and the one container the project uses. Both
# are mirrored in api/local.settings.json.example as MEDIA_BASE_URL, and the
# container name matches the one infra/modules/mediaStorage.bicep provisions — the
# same blob path resolves locally, on dev and on prod.
#
# Exported because scripts/lib/blob-seed.mjs reads MEDIA_CONTAINER from the
# environment rather than repeating the literal.
AZURITE_BLOB_PORT='10000'
AZURITE_BLOB_ENDPOINT="http://127.0.0.1:$AZURITE_BLOB_PORT/devstoreaccount1"
MEDIA_CONTAINER='media'
export MEDIA_CONTAINER

# Top-level folders of db/seed/media that hold reference media: the bytes db/seed/reference.sql
# points at, deployed to every environment. Everything else there is demonstration media and
# never leaves this machine — blob-seed.sh keeps no list of those, it sweeps what is not here.
#
# The one definition of the split. api/test/seedMedia.test.ts parses this very line rather than
# repeating it: a folder the test called reference and this list did not would be uploaded by
# the local --demo sweep and by nothing else, so it would look right on every machine and 404
# in production.
MEDIA_REFERENCE_DIRS=(technologies)

# ─── SQL connection ──────────────────────────────────────────────────────────
# One sqlcmd code path for every environment. Local uses SQL authentication — the
# only place it is allowed; Azure SQL is Entra-only and reuses the current `az`
# session, so no password is ever handled for a cloud environment.
#
#   sql_configure <local|dev>
# then use: sql_query "<sql>"   sql_run_file <path>   $SQL_TARGET

SQL_ARGS=()
SQL_TARGET=''

sql_configure() {
  local env_name="$1"
  need_cmd sqlcmd "Install go-sqlcmd: brew install sqlcmd"

  case "$env_name" in
    local)
      # The instance is shared by every workspace; the database is not. The password is a
      # property of the instance and comes from the shared store, never from a .env that
      # may have drifted.
      workspace_resolve
      MSSQL_SA_PASSWORD="$(workspace_sa_password)"
      SQL_SERVER_NAME='localhost,1433'
      SQL_DB_NAME="$LEHUB_DB_NAME"
      SQL_ARGS=(-S "$SQL_SERVER_NAME" -U sa -P "$MSSQL_SA_PASSWORD" -C)
      ;;
    dev)
      need_cmd az "Install the Azure CLI, then run: az login"
      SQL_SERVER_NAME='sql-lehub-dev.database.windows.net'
      SQL_DB_NAME='lehub'
      SQL_ARGS=(-S "$SQL_SERVER_NAME" --authentication-method ActiveDirectoryAzCli)
      ;;
    *)
      die "Unknown environment '$env_name' (expected: local | dev)"
      ;;
  esac

  SQL_ENV="$env_name"
  SQL_TARGET="$SQL_SERVER_NAME/$SQL_DB_NAME"
}

# Run a statement and return its rows, one per line, unformatted.
# `-r 1` matters most here: callers capture this in "$(...)", so without it a SQL error
# would be captured as if it were data — and silently discarded when the caller aborts.
sql_query() {
  sqlcmd "${SQL_ARGS[@]}" -d "$SQL_DB_NAME" -b -r 1 -h -1 -W -s '|' -Q "SET NOCOUNT ON; $1" \
    | sed '/^$/d'
}

# Run a statement for its effect only.
# `-r 1` routes SQL error text to stderr; sqlcmd writes it to stdout by default, which
# the redirection below would swallow, leaving a failure with no message at all.
sql_exec() {
  sqlcmd "${SQL_ARGS[@]}" -d "$SQL_DB_NAME" -b -r 1 -Q "SET NOCOUNT ON; $1" >/dev/null
}

# Run a statement against master (used to create the local database).
sql_exec_master() {
  sqlcmd "${SQL_ARGS[@]}" -d master -b -r 1 -Q "SET NOCOUNT ON; $1" >/dev/null
}

# Same as sql_query, against master: the workspace database may not exist yet, and
# connecting to a missing database fails before the statement runs.
sql_query_master() {
  sqlcmd "${SQL_ARGS[@]}" -d master -b -r 1 -h -1 -W -s '|' -Q "SET NOCOUNT ON; $1" \
    | sed '/^$/d'
}

# ─── Databases on the shared instance ────────────────────────────────────────
# Workspace slugs are [a-z0-9-] by construction (workspace_slug), so a name never needs
# escaping beyond the brackets and the N'' literal below.

instance_db_exists() {
  [[ -n "$(sql_query_master "SELECT 1 FROM sys.databases WHERE name = N'$1'")" ]]
}

instance_db_create() {
  sql_exec_master "IF DB_ID('$1') IS NULL CREATE DATABASE [$1];"
}

# SINGLE_USER WITH ROLLBACK IMMEDIATE first: a Functions host left connected would
# otherwise hold the drop open until it exits.
instance_db_drop() {
  # The MULTI_USER reset is the point of the CATCH: if anything takes the single connection
  # slot between the two statements — a Functions host reconnecting, a sqlcmd left open in
  # another terminal — the ALTER succeeds and the DROP fails. Left in SINGLE_USER, the
  # database would then fail the next dev-up.sh with a login error saying nothing about it.
  sql_exec_master "IF DB_ID('$1') IS NOT NULL
    BEGIN
      BEGIN TRY
        ALTER DATABASE [$1] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
        DROP DATABASE [$1];
      END TRY
      BEGIN CATCH
        -- WITH ROLLBACK IMMEDIATE here too: without a termination clause this waits
        -- indefinitely for the exclusive access the session that broke the DROP is holding,
        -- so the recovery would hang on the very race it exists for.
        IF DB_ID('$1') IS NOT NULL ALTER DATABASE [$1] SET MULTI_USER WITH ROLLBACK IMMEDIATE;
        THROW;
      END CATCH
    END"
}

# Every LeHub database on the instance, one per line — what --volumes must warn about.
instance_list_dbs() {
  sql_query_master "SELECT name FROM sys.databases WHERE name LIKE 'lehub%' ORDER BY name"
}

# Run a whole file.
sql_run_file() {
  sqlcmd "${SQL_ARGS[@]}" -d "$SQL_DB_NAME" -b -i "$1"
}

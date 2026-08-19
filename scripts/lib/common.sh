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

# ─── Local processes ─────────────────────────────────────────────────────────
# The ports the local stack listens on, in the order dev-start.sh names them.
DEV_PORTS=(7071 5173 5174)

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
      if [[ -z "${MSSQL_SA_PASSWORD:-}" ]]; then
        # Not `cp .env.example .env`: the template carries no password, dev-up.sh
        # generates one.
        [[ -f "$ROOT_DIR/.env" ]] || die ".env not found. Run ./scripts/dev-up.sh"
        set -a; . "$ROOT_DIR/.env"; set +a
      fi
      [[ -n "${MSSQL_SA_PASSWORD:-}" ]] || die "MSSQL_SA_PASSWORD is not set — see .env.example"
      SQL_SERVER_NAME='localhost,1433'
      SQL_DB_NAME='lehub-local'
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

# Run a whole file.
sql_run_file() {
  sqlcmd "${SQL_ARGS[@]}" -d "$SQL_DB_NAME" -b -i "$1"
}

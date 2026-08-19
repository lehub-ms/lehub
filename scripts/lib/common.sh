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
        [[ -f "$ROOT_DIR/.env" ]] || die ".env not found. Run: cp .env.example .env"
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
sql_query() {
  sqlcmd "${SQL_ARGS[@]}" -d "$SQL_DB_NAME" -b -h -1 -W -s '|' -Q "SET NOCOUNT ON; $1" \
    | sed '/^$/d'
}

# Run a statement for its effect only.
sql_exec() {
  sqlcmd "${SQL_ARGS[@]}" -d "$SQL_DB_NAME" -b -Q "SET NOCOUNT ON; $1" >/dev/null
}

# Run a statement against master (used to create the local database).
sql_exec_master() {
  sqlcmd "${SQL_ARGS[@]}" -d master -b -Q "SET NOCOUNT ON; $1" >/dev/null
}

# Run a whole file.
sql_run_file() {
  sqlcmd "${SQL_ARGS[@]}" -d "$SQL_DB_NAME" -b -i "$1"
}

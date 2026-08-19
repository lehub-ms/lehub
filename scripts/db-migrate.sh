#!/usr/bin/env bash
# Apply pending LeHub database migrations.
#
#   ./scripts/db-migrate.sh local             apply to the local Docker container
#   ./scripts/db-migrate.sh dev [--dry-run]   apply to Azure SQL dev (Entra auth)
#
# Migrations are the files in db/migrations, applied in lexicographic order, each
# exactly once. dbo.__migrations records the file name, its SHA-256 and when it was
# applied; a file that changed after being applied is refused rather than replayed.
#
# Each migration runs inside a single transaction together with the row that records
# it, so a failure leaves the database exactly as it was.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

ENV_NAME=''
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --dry-run) DRY_RUN=true; shift ;;
    local|dev) ENV_NAME="$1"; shift ;;
    *) usage >&2; die "Unexpected argument '$1'" ;;
  esac
done

[[ -n "$ENV_NAME" ]] || { usage >&2; die "Missing environment (local | dev)"; }

MIGRATIONS_DIR="$ROOT_DIR/db/migrations"
[[ -d "$MIGRATIONS_DIR" ]] || die "Migrations directory not found: $MIGRATIONS_DIR"

sql_configure "$ENV_NAME"

# The local database is created here; cloud databases are provisioned by Bicep.
if [[ "$ENV_NAME" == "local" ]]; then
  sql_exec_master "IF DB_ID('$SQL_DB_NAME') IS NULL CREATE DATABASE [$SQL_DB_NAME];"
fi

info "Migrating $SQL_TARGET"

sql_exec "
IF OBJECT_ID('dbo.__migrations', 'U') IS NULL
  CREATE TABLE dbo.__migrations (
    Filename  NVARCHAR(200) NOT NULL CONSTRAINT PK___migrations PRIMARY KEY,
    Checksum  CHAR(64)      NOT NULL,
    AppliedAt DATETIME2(3)  NOT NULL CONSTRAINT DF___migrations_AppliedAt DEFAULT SYSUTCDATETIME()
  );"

# Snapshot of what is already applied: "filename|checksum" per line.
APPLIED="$(sql_query "SELECT Filename + '|' + Checksum FROM dbo.__migrations")"

shopt -s nullglob
MIGRATIONS=("$MIGRATIONS_DIR"/*.sql)
shopt -u nullglob

if [[ ${#MIGRATIONS[@]} -eq 0 ]]; then
  ok "No migration files — nothing to do."
  exit 0
fi

# Reject duplicate numeric prefixes before touching the database: two files sharing
# a number means two branches picked the same slot, and the apply order would then
# depend on the rest of the file name.
DUPES="$(printf '%s\n' "${MIGRATIONS[@]}" | xargs -n1 basename | cut -d_ -f1 | sort | uniq -d)"
[[ -z "$DUPES" ]] || die "Duplicate migration prefixes: $(echo "$DUPES" | tr '\n' ' ')"

PENDING=()
for path in "${MIGRATIONS[@]}"; do
  name="$(basename "$path")"
  checksum="$(sha256_of "$path")"
  recorded="$(printf '%s\n' "$APPLIED" | awk -F'|' -v n="$name" '$1==n {print $2}')"

  if [[ -z "$recorded" ]]; then
    PENDING+=("$path")
  elif [[ "$recorded" != "$checksum" ]]; then
    die "$name changed after it was applied (recorded ${recorded:0:12}…, now ${checksum:0:12}…).
  A migration is immutable once merged. Revert the file, or add a new migration."
  fi
done

if [[ ${#PENDING[@]} -eq 0 ]]; then
  ok "Database is up to date — nothing to apply."
  exit 0
fi

if [[ "$DRY_RUN" == true ]]; then
  info "${#PENDING[@]} migration(s) pending:"
  for path in "${PENDING[@]}"; do dim "$(basename "$path")"; done
  exit 0
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

for path in "${PENDING[@]}"; do
  name="$(basename "$path")"
  checksum="$(sha256_of "$path")"
  wrapped="$TMP_DIR/$name"

  # The migration and the row recording it commit together or not at all.
  # XACT_ABORT makes any error roll the whole batch back.
  {
    printf 'SET NOCOUNT ON;\nSET XACT_ABORT ON;\nBEGIN TRANSACTION;\n'
    cat "$path"
    printf "\nINSERT INTO dbo.__migrations (Filename, Checksum) VALUES (N'%s', '%s');\n" \
      "${name//\'/\'\'}" "$checksum"
    printf 'COMMIT TRANSACTION;\n'
  } > "$wrapped"

  info "Applying $name"
  sql_run_file "$wrapped" || die "$name failed — the database was left unchanged."
done

ok "Applied ${#PENDING[@]} migration(s) to $SQL_TARGET"

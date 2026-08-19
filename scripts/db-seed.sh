#!/usr/bin/env bash
# Seed the LeHub database.
#
#   ./scripts/db-seed.sh local          reference data only
#   ./scripts/db-seed.sh local --demo   reference data + demonstration data
#   ./scripts/db-seed.sh dev --demo     same, against Azure SQL dev (Entra auth)
#
# Reference data (db/seed/reference.sql) is real business data — event formats and
# participation modes — and belongs in every environment.
#
# Demonstration data (db/seed/demo.sql) is fictitious and is gated behind --demo,
# which is only accepted for environments that allow it. It must never reach an
# environment open to the public.
#
# Both files are idempotent: replaying them inserts nothing that already exists and
# overwrites nothing that was edited in place.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

# Environments allowed to receive demonstration data. Adding `prod` here would be a
# reviewable change, which is the point.
DEMO_ALLOWED=(local dev)

ENV_NAME=''
WITH_DEMO=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --demo)    WITH_DEMO=true; shift ;;
    -*) usage >&2; die "Unknown option '$1'" ;;
    # The environment name is validated by sql_configure, the single place that
    # knows which environments exist.
    *) [[ -z "$ENV_NAME" ]] || { usage >&2; die "Unexpected argument '$1'"; }
       ENV_NAME="$1"; shift ;;
  esac
done

[[ -n "$ENV_NAME" ]] || { usage >&2; die "Missing environment (local | dev)"; }

if [[ "$WITH_DEMO" == true ]]; then
  allowed=false
  for e in "${DEMO_ALLOWED[@]}"; do [[ "$e" == "$ENV_NAME" ]] && allowed=true; done
  [[ "$allowed" == true ]] || die "--demo is not allowed for '$ENV_NAME'. Demonstration data must never reach an environment open to the public."
fi

SEED_DIR="$ROOT_DIR/db/seed"
[[ -f "$SEED_DIR/reference.sql" ]] || die "Seed file not found: $SEED_DIR/reference.sql"

sql_configure "$ENV_NAME"
info "Seeding $SQL_TARGET"

info "Applying reference data"
sql_run_file "$SEED_DIR/reference.sql" || die "reference.sql failed."

if [[ "$WITH_DEMO" == true ]]; then
  [[ -f "$SEED_DIR/demo.sql" ]] || die "Seed file not found: $SEED_DIR/demo.sql"
  info "Applying demonstration data"
  sql_run_file "$SEED_DIR/demo.sql" || die "demo.sql failed."
  ok "Seeded $SQL_TARGET with reference and demonstration data"
else
  ok "Seeded $SQL_TARGET with reference data"
  dim "Add --demo for the development data set."
fi

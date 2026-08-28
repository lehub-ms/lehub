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
# LEHUB_BOOTSTRAP_ADMIN_EMAILS registers the environment's first global administrators
# (db/seed/admins.sql), separated by commas or spaces. Unset, the step is skipped: an
# environment with no bootstrap address is a normal state, not a failure.
#
# All three files are idempotent: replaying them inserts nothing that already exists and
# overwrites nothing that was edited in place.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
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

# ─── First global administrators ─────────────────────────────────────────────
#
# Registers the addresses; it promotes nobody here. The promotion happens on the named
# account's next sign-in — see db/seed/admins.sql and db/migrations/0004.
if [[ -n "${LEHUB_BOOTSTRAP_ADMIN_EMAILS:-}" ]]; then
  [[ -f "$SEED_DIR/admins.sql" ]] || die "Seed file not found: $SEED_DIR/admins.sql"

  # One `(N'address')` row per address, commas and semicolons treated as separators so a
  # shell variable, a GitHub variable and a .env line can all spell the list naturally.
  #
  # Deduplicated, because MERGE evaluates its source rows against a snapshot of the target:
  # two identical rows both take the NOT MATCHED branch, and the second violates the primary
  # key. One address pasted twice into the variable would fail the deployment — a harsh
  # penalty for a copy-paste.
  BOOTSTRAP_ADMIN_VALUES=''
  for email in $(printf '%s\n' ${LEHUB_BOOTSTRAP_ADMIN_EMAILS//[,;]/ } | sort -u); do
    # Loud rather than silent: a typo here ends up as a row nobody will ever match, and the
    # account it was meant for never becomes an administrator.
    [[ "$email" == *@*.* ]] || die "LEHUB_BOOTSTRAP_ADMIN_EMAILS: '$email' is not an email address."
    # Every quote doubled — an address is data, and must never be able to close the literal.
    # Its own statement, and the right-hand side unquoted, because that is the only form
    # where bash reads \' as an escaped quote: written inline inside the double-quoted
    # string below, the pattern would never match and the doubling would silently not
    # happen. An assignment does not word-split, so the missing quotes cost nothing.
    escaped=${email//\'/\'\'}
    BOOTSTRAP_ADMIN_VALUES+="  (N'$escaped'),"$'\n'
  done
  BOOTSTRAP_ADMIN_VALUES="${BOOTSTRAP_ADMIN_VALUES%,$'\n'}"

  # An explicit template rather than `mktemp -t`: BSD appends its own suffix, GNU demands
  # the X's, and only this form means the same thing on both. Same reasoning as
  # scripts/db-bootstrap-mi.sh, which renders db/bootstrap/create-mi-user.sql the same way.
  RENDERED_ADMINS="$(mktemp "${TMPDIR:-/tmp}/lehub-admins.XXXXXX")"
  trap 'rm -f "$RENDERED_ADMINS"' EXIT

  # The value goes through the environment rather than into the program text, so an address
  # can never be read as perl code.
  BOOTSTRAP_ADMIN_VALUES="$BOOTSTRAP_ADMIN_VALUES" perl -pe '
    s/<BOOTSTRAP_ADMIN_EMAILS>/$ENV{BOOTSTRAP_ADMIN_VALUES}/g;
  ' "$SEED_DIR/admins.sql" > "$RENDERED_ADMINS"

  info "Registering the bootstrap administrators"
  sql_run_file "$RENDERED_ADMINS" || die "admins.sql failed."
else
  dim "LEHUB_BOOTSTRAP_ADMIN_EMAILS is unset — no bootstrap administrator registered."
fi

if [[ "$WITH_DEMO" == true ]]; then
  [[ -f "$SEED_DIR/demo.sql" ]] || die "Seed file not found: $SEED_DIR/demo.sql"
  info "Applying demonstration data"
  sql_run_file "$SEED_DIR/demo.sql" || die "demo.sql failed."
  ok "Seeded $SQL_TARGET with reference and demonstration data"
else
  ok "Seeded $SQL_TARGET with reference data"
  dim "Add --demo for the development data set."
fi

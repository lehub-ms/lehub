#!/usr/bin/env bash
# Grant the API's managed identity access to the LeHub database.
#
#   ./scripts/db-bootstrap-mi.sh dev
#
# Applies db/bootstrap/create-mi-user.sql, which creates the database user and puts it
# in db_datareader and db_datawriter. Run it once per environment, after the database
# exists and before the API needs to read anything.
#
# The identity is named by its SID rather than resolved through Microsoft Entra, so the
# SQL server never needs Directory.Read.All-class permissions. The SID is the identity's
# client ID with the first three groups byte-reversed — that conversion is what this
# script exists for.
#
# Idempotent: the SQL itself is guarded, so running it twice changes nothing.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

cd "$ROOT_DIR"

usage() {
  sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

ENV_NAME=''

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -*) usage >&2; die "Unknown option '$1'" ;;
    *) [[ -z "$ENV_NAME" ]] || { usage >&2; die "Unexpected argument '$1'"; }
       ENV_NAME="$1"; shift ;;
  esac
done

[[ -n "$ENV_NAME" ]] || { usage >&2; die "Missing environment (dev)"; }

# Deliberately narrower than sql_configure: the local container authenticates with a
# password and has no managed identity to grant anything to.
case "$ENV_NAME" in
  dev) ;;
  local) die "The local database uses SQL authentication and has no managed identity." ;;
  *) die "Unknown environment '$ENV_NAME' (expected: dev)" ;;
esac

# ─── 1. Prerequisites ────────────────────────────────────────────────────────

need_cmd az "Install the Azure CLI, then run: az login"
need_cmd perl "Install Perl — needed to render the bootstrap script below."

TEMPLATE="$ROOT_DIR/db/bootstrap/create-mi-user.sql"
[[ -f "$TEMPLATE" ]] || die "Bootstrap script not found: $TEMPLATE"

MI_NAME="id-lehub-$ENV_NAME"
RESOURCE_GROUP="rg-lehub-$ENV_NAME"

# ─── 2. Read the identity ────────────────────────────────────────────────────

info "Reading $MI_NAME from $RESOURCE_GROUP"

CLIENT_ID="$(az identity show \
  -n "$MI_NAME" -g "$RESOURCE_GROUP" \
  --query clientId -o tsv 2>/dev/null)" \
  || die "Identity '$MI_NAME' not found in '$RESOURCE_GROUP'. Deploy the infrastructure first."

[[ -n "$CLIENT_ID" ]] || die "Could not read the client ID of '$MI_NAME'."

# SQL Server stores an Entra principal's SID as the client ID in little-endian byte
# order: the first three dash-separated groups are byte-reversed, the last two are not.
guid_to_sid() {
  local guid
  guid="$(printf '%s' "${1//-/}" | tr 'A-Z' 'a-z')"
  [[ ${#guid} -eq 32 ]] || die "Not a GUID: $1"

  local a="${guid:0:8}" b="${guid:8:4}" c="${guid:12:4}" tail="${guid:16:16}"
  printf '0x%s%s%s%s' \
    "${a:6:2}${a:4:2}${a:2:2}${a:0:2}" \
    "${b:2:2}${b:0:2}" \
    "${c:2:2}${c:0:2}" \
    "$tail"
}

MI_SID="$(guid_to_sid "$CLIENT_ID")"

dim "clientId $CLIENT_ID"
dim "SID      $MI_SID"

# ─── 3. Apply ────────────────────────────────────────────────────────────────

sql_configure "$ENV_NAME"

# An explicit template rather than `mktemp -t`: BSD appends its own suffix, GNU
# demands the X's, and only this form means the same thing on both.
RENDERED="$(mktemp "${TMPDIR:-/tmp}/lehub-mi-user.XXXXXX")"
trap 'rm -f "$RENDERED"' EXIT

# Values go through the environment rather than into the program text, so a name or a
# SID can never be read as perl code.
MI_NAME="$MI_NAME" MI_SID="$MI_SID" perl -pe '
  s/<MI_NAME>/$ENV{MI_NAME}/g;
  s/<MI_SID>/$ENV{MI_SID}/g;
' "$TEMPLATE" > "$RENDERED"

info "Granting $MI_NAME on $SQL_TARGET"

# The dev database auto-pauses after an hour, so the first connection may be waking it.
sql_run_file "$RENDERED" || die "Failed to apply the bootstrap script. If the database was paused, try again."

ok "$MI_NAME can read and write $SQL_TARGET"

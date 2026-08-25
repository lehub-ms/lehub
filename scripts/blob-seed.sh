#!/usr/bin/env bash
# Upload the seed media to an environment's media container.
#
#   ./scripts/blob-seed.sh local          the reference icons, in the Azurite emulator
#   ./scripts/blob-seed.sh local --demo   plus the demonstration placeholders
#   ./scripts/blob-seed.sh dev            the reference icons, in the dev media account
#
# Reference media (db/seed/media/technologies) are the bytes db/seed/reference.sql points
# at. They are real business assets and belong in every environment, so they are uploaded
# with no flag, next to where the deployment chain applies the reference data.
#
# Demonstration media (communities, events) are placeholders and are gated behind --demo,
# which only `local` accepts — one notch stricter than db-seed.sh, which allows dev. They
# must never reach an environment open to the public.
#
# Locally the container is created on the fly with anonymous blob-level read, which is what
# infra/modules/mediaStorage.bicep provisions in the cloud, so the local loop exercises the
# production path. In the cloud the container is Bicep's and this script only writes blobs:
# publicAccess is a control-plane property, and setting it from the data plane would need a
# shared key this account refuses.
#
# Idempotent: replaying uploads the same bytes over the same names, creating nothing twice.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

# Environments allowed to receive demonstration media. Deliberately narrower than
# db-seed.sh's: fictitious rows may live on dev, the visuals that go with them may not
# leave this machine. Adding `dev` here would be a reviewable change, which is the point.
DEMO_ALLOWED=(local)

ENV_NAME=''
WITH_DEMO=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --demo)    WITH_DEMO=true; shift ;;
    -*) usage >&2; die "Unknown option '$1'" ;;
    *) [[ -z "$ENV_NAME" ]] || { usage >&2; die "Unexpected argument '$1'"; }
       ENV_NAME="$1"; shift ;;
  esac
done

[[ -n "$ENV_NAME" ]] || { usage >&2; die "Missing environment (local | dev | prod)"; }
case "$ENV_NAME" in
  local|dev|prod) ;;
  *) die "Unknown environment '$ENV_NAME' (expected: local | dev | prod)" ;;
esac

if [[ "$WITH_DEMO" == true ]]; then
  allowed=false
  for e in "${DEMO_ALLOWED[@]}"; do [[ "$e" == "$ENV_NAME" ]] && allowed=true; done
  [[ "$allowed" == true ]] || die "--demo is not allowed for '$ENV_NAME'. Demonstration media must never reach an environment open to the public."
fi

MEDIA_DIR="$ROOT_DIR/db/seed/media"
[[ -d "$MEDIA_DIR" ]] || die "Media directory not found: $MEDIA_DIR"

# ─── What to upload ──────────────────────────────────────────────────────────
# Blob names are paths relative to db/seed/media: the directory tree is the container
# tree, and that is exactly the string the seed files store. README.md is not media.
#
# The reference tier is always included; the demonstration tier is whatever folder is not
# a reference one, and only joins under --demo.

BLOBS=()

collect() {
  local dir="$1" file
  [[ -d "$MEDIA_DIR/$dir" ]] || die "Media directory not found: $MEDIA_DIR/$dir"
  while IFS= read -r file; do
    [[ "${file##*/}" == 'README.md' ]] && continue
    BLOBS+=("${file#"$MEDIA_DIR/"}")
  done < <(find "$MEDIA_DIR/$dir" -type f | sort)
}

is_reference_dir() {
  local dir
  for dir in "${MEDIA_REFERENCE_DIRS[@]}"; do [[ "$dir" == "$1" ]] && return 0; done
  return 1
}

for dir in "${MEDIA_REFERENCE_DIRS[@]}"; do collect "$dir"; done

if [[ "$WITH_DEMO" == true ]]; then
  while IFS= read -r entry; do
    is_reference_dir "$entry" || collect "$entry"
  done < <(find "$MEDIA_DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort)
fi

[[ ${#BLOBS[@]} -gt 0 ]] || die "No media found under ${MEDIA_DIR#"$ROOT_DIR/"}."

# Resolved here rather than in either uploader, so an unknown extension fails before a
# single byte is written instead of half-way through.
CONTENT_TYPES=()
for blob in "${BLOBS[@]}"; do
  content_type="$(media_content_type "$blob")" \
    || die "Unknown media type for $blob.
  Add its extension to media_content_type in scripts/lib/common.sh."
  CONTENT_TYPES+=("$content_type")
done

# ─── Local: the emulator ─────────────────────────────────────────────────────

upload_local() {
  need_cmd node "Install Node — see docs/local-dev.md"

  # The uploader speaks the Azure Blob REST API through the SDK, the only client that
  # understands the UseDevelopmentStorage=true shortcut — which is how this repository
  # talks to the emulator without writing a storage key into a versioned file.
  #
  # It is consumed from api/node_modules, as dev-start.sh does for concurrently: there
  # is no root package.json, on purpose. A workspace that installed its dependencies
  # before this script existed has the directory but not the package, and dev-up.sh
  # skips `npm ci` whenever node_modules is present — hence the explicit check.
  [[ -d "$ROOT_DIR/api/node_modules/@azure/storage-blob" ]] \
    || die "@azure/storage-blob is not installed. Run: npm --prefix api ci"

  local pairs=() i
  for i in "${!BLOBS[@]}"; do pairs+=("${BLOBS[$i]}=${CONTENT_TYPES[$i]}"); done

  node "$SCRIPT_DIR/lib/blob-seed.mjs" "${pairs[@]}"
}

# ─── Cloud: the environment's media account ──────────────────────────────────

# Discovered rather than passed in, so the command has the same shape as the other
# scripts and the deployment workflow hard-codes no resource name. The account carries a
# uniqueString hash, so its full name is not knowable from the environment alone — only
# its prefix is, which CLAUDE.md fixes as stlehubmedia<env><hash>.
resolve_media_account() {
  local group="rg-lehub-$ENV_NAME" names
  # A control-plane read, unlike everything below it: listing needs
  # Microsoft.Storage/storageAccounts/read on the group, which the data role does not grant.
  names="$(az storage account list --resource-group "$group" --only-show-errors \
    --query "[?starts_with(name, 'stlehubmedia')].name" --output tsv 2>&1)" \
    || die "Could not list the storage accounts of $group:
  ${names//$'\n'/$'\n'  }
  Check the subscription with: az account show"

  [[ -n "$names" ]] || die "No media storage account in $group.
  The account and its container are provisioned by Bicep. Deploy it first:
    ./scripts/infra-deploy.sh $ENV_NAME"
  [[ "$(printf '%s\n' "$names" | wc -l)" -eq 1 ]] || die "Several accounts match stlehubmedia* in $group:
$names
  Remove the leftover one — a deployment resolves the name deterministically."

  printf '%s' "$names"
}

# 'true', 'false', or a non-zero return with the CLI's own diagnostic on stdout. The two
# outcomes are not the same problem and must not be reported as one: an absent container
# is a deployment that has not run, an unreadable one is an identity that cannot read.
#
# --auth-mode login on every call: the account refuses shared keys, so the CLI must not
# try to fetch one. The identity is whoever is logged in — the deployment chain's service
# principal in CI, an operator otherwise, and either needs Storage Blob Data Contributor
# on this account and nothing wider.
container_exists() {
  az storage container exists --auth-mode login --only-show-errors \
    --account-name "$1" --name "$MEDIA_CONTAINER" --query exists --output tsv 2>&1
}

assert_container() {
  local account="$1" attempt result

  # The role assignment this call exercises is created by the same deployment, a job
  # earlier, and Azure data-plane RBAC takes minutes to propagate. Retried on the terms
  # the CD's "Wake the database" step already sets for a prerequisite that is slow rather
  # than missing. Only the unreadable case waits: a container that answers 'false' is
  # absent, which no amount of waiting fixes, and says so immediately.
  for attempt in 1 2 3; do
    if result="$(container_exists "$account")"; then
      [[ "$result" == 'true' ]] && return 0
      die "Container '$MEDIA_CONTAINER' does not exist on $account.
  It is provisioned by infra/modules/mediaStorage.bicep — this script only writes blobs,
  because anonymous read is a control-plane property. Deploy it first:
    ./scripts/infra-deploy.sh $ENV_NAME"
    fi
    [[ "$attempt" -lt 3 ]] || break
    dim "attempt $attempt: cannot read $MEDIA_CONTAINER on $account yet, waiting 30s"
    sleep 30
  done

  # The CLI's own message, not a guess: an expired session, the wrong subscription or
  # throttling must not be reported as a missing role.
  die "Cannot read container '$MEDIA_CONTAINER' on $account:
  ${result//$'\n'/$'\n'  }
  If this is AuthorizationPermissionMismatch, the signed-in identity is missing Storage
  Blob Data Contributor on $account — see docs/deployment.md. Being Contributor on the
  resource group grants nothing on the data, and this account has no key to fall back on."
}

upload_cloud() {
  local account="$1" i
  for i in "${!BLOBS[@]}"; do
    dim "${BLOBS[$i]}"
    # --overwrite makes a replay upload the same bytes over the same name: no duplicate,
    # no error. An upload that fails aborts the script, so a green deployment can never
    # leave the container empty.
    az storage blob upload --auth-mode login --only-show-errors --output none \
      --account-name "$account" --container-name "$MEDIA_CONTAINER" \
      --name "${BLOBS[$i]}" --file "$MEDIA_DIR/${BLOBS[$i]}" \
      --content-type "${CONTENT_TYPES[$i]}" \
      --content-cache-control "$MEDIA_CACHE_CONTROL" \
      --overwrite \
      || die "Failed to upload ${BLOBS[$i]} to $account.
  An AuthorizationPermissionMismatch above means the signed-in identity lacks Storage
  Blob Data Contributor on $account — see docs/deployment.md. RBAC also takes a few
  minutes to propagate after a first grant."
  done
}

# ─── Run ─────────────────────────────────────────────────────────────────────

if [[ "$WITH_DEMO" == true ]]; then
  info "Uploading the reference and demonstration media to $ENV_NAME"
else
  info "Uploading the reference media to $ENV_NAME"
fi

if [[ "$ENV_NAME" == 'local' ]]; then
  upload_local
  ok "${#BLOBS[@]} media in $AZURITE_BLOB_ENDPOINT/$MEDIA_CONTAINER"
else
  need_cmd az "Install the Azure CLI, then run: az login"
  # Resolved and checked before the first upload, so a missing account, a missing
  # container or a missing role reads as itself rather than as a failed blob write.
  MEDIA_ACCOUNT="$(resolve_media_account)"
  assert_container "$MEDIA_ACCOUNT"
  upload_cloud "$MEDIA_ACCOUNT"
  ok "${#BLOBS[@]} media in https://$MEDIA_ACCOUNT.blob.core.windows.net/$MEDIA_CONTAINER"
fi

if [[ "$WITH_DEMO" == false && "$ENV_NAME" == 'local' ]]; then
  dim "Add --demo to upload the demonstration media."
fi

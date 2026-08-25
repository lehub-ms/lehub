#!/usr/bin/env bash
# Prepare the local media container in the Azurite emulator.
#
#   ./scripts/blob-seed.sh local          create the media container, nothing else
#   ./scripts/blob-seed.sh local --demo   also upload db/seed/media/**
#
# The container is created with anonymous blob-level read, which is what
# infra/modules/mediaStorage.bicep provisions in the cloud. The local loop therefore
# exercises the production path — the API composes an absolute URL, the browser
# fetches it cross-origin, nothing proxies anything.
#
# `local` is the only environment accepted here. Cloud containers are provisioned by
# Bicep, and demonstration media must never reach an environment open to the public.
#
# Idempotent: replaying creates nothing twice and overwrites only the demonstration
# media with identical bytes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

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

[[ -n "$ENV_NAME" ]] || { usage >&2; die "Missing environment (local)"; }
[[ "$ENV_NAME" == "local" ]] || die "Unknown environment '$ENV_NAME' (expected: local).
  The cloud media container is provisioned by infra/modules/mediaStorage.bicep, and
  demonstration media never leaves this machine."

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

if [[ "$WITH_DEMO" == true ]]; then
  info "Creating the media container and uploading the demonstration media"
  node "$SCRIPT_DIR/lib/blob-seed.mjs" --demo
  ok "Media container ready at $AZURITE_BLOB_ENDPOINT/$MEDIA_CONTAINER"
else
  info "Creating the media container"
  node "$SCRIPT_DIR/lib/blob-seed.mjs"
  ok "Media container ready at $AZURITE_BLOB_ENDPOINT/$MEDIA_CONTAINER"
  dim "Add --demo to upload the demonstration media."
fi

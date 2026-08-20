#!/usr/bin/env bash
# Deploy the LeHub Azure infrastructure for one environment.
#
#   ./scripts/infra-deploy.sh dev --what-if    show what would change, touch nothing
#   ./scripts/infra-deploy.sh dev              apply infra/main.dev.bicepparam
#   ./scripts/infra-deploy.sh prod --what-if   validate the production parameters
#
# Resource groups are created by hand and this script never creates one: it refuses to
# run against a group that does not exist, rather than inventing it in the wrong region.
#
# Applying to prod asks for the group name to be typed back. Production is deployed
# deliberately or not at all.
#
# Run the migrations, the seed and ./scripts/db-bootstrap-mi.sh after a first
# deployment — Bicep provisions the database but never its contents.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

cd "$ROOT_DIR"

usage() {
  sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

ENV_NAME=''
WHAT_IF=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --what-if) WHAT_IF=true; shift ;;
    -*) usage >&2; die "Unknown option '$1'" ;;
    *) [[ -z "$ENV_NAME" ]] || { usage >&2; die "Unexpected argument '$1'"; }
       ENV_NAME="$1"; shift ;;
  esac
done

[[ -n "$ENV_NAME" ]] || { usage >&2; die "Missing environment (dev | prod)"; }

# Unlike the database scripts, the environment list lives here: it is the set of
# bicepparam files, and adding one is a reviewable change.
case "$ENV_NAME" in
  dev|prod) ;;
  *) die "Unknown environment '$ENV_NAME' (expected: dev | prod)" ;;
esac

# ─── 1. Prerequisites ────────────────────────────────────────────────────────

need_cmd az "Install the Azure CLI, then run: az login"

az account show >/dev/null 2>&1 || die "Not signed in to Azure. Run: az login"

TEMPLATE="$ROOT_DIR/infra/main.bicep"
PARAMS="$ROOT_DIR/infra/main.$ENV_NAME.bicepparam"
RESOURCE_GROUP="rg-lehub-$ENV_NAME"

[[ -f "$TEMPLATE" ]] || die "Template not found: $TEMPLATE"
[[ -f "$PARAMS" ]] || die "Parameters not found: $PARAMS"

# Fail here rather than half-way through a deployment against nothing.
RG_LOCATION="$(az group show -n "$RESOURCE_GROUP" --query location -o tsv 2>/dev/null)" \
  || die "Resource group '$RESOURCE_GROUP' does not exist. Create it by hand, in westeurope."

# main.bicep takes its location from the group, so the group's region silently becomes the
# region of the whole environment. A prod group created in the wrong place would deploy all
# of production outside the only authorised region and report success. Checked here because
# the template cannot express it: by the time it runs, the choice is already made.
[[ "$RG_LOCATION" == "westeurope" ]] \
  || die "Resource group '$RESOURCE_GROUP' is in '$RG_LOCATION'. westeurope is the only authorised region."

SUBSCRIPTION="$(az account show --query name -o tsv)"

# ─── 2. What-if ──────────────────────────────────────────────────────────────

if [[ "$WHAT_IF" == true ]]; then
  info "Previewing $ENV_NAME on $RESOURCE_GROUP ($SUBSCRIPTION)"
  az deployment group what-if \
    -g "$RESOURCE_GROUP" \
    --template-file "$TEMPLATE" \
    --parameters "$PARAMS"
  exit 0
fi

# ─── 3. Confirmation ─────────────────────────────────────────────────────────

if [[ "$ENV_NAME" == "prod" ]]; then
  warn "This applies to PRODUCTION: $RESOURCE_GROUP on $SUBSCRIPTION."
  dim "Preview it first with --what-if if you have not."
  # Reading the name back is the point: a stray return key must not deploy prod.
  read -r -p "Type the resource group name to continue: " CONFIRMATION
  [[ "$CONFIRMATION" == "$RESOURCE_GROUP" ]] || die "Aborted."
fi

# ─── 4. Deploy ───────────────────────────────────────────────────────────────

# Named per run so the group's deployment history stays readable.
DEPLOYMENT_NAME="lehub-$ENV_NAME-$(date -u +%Y%m%d%H%M%S)"

info "Deploying $ENV_NAME to $RESOURCE_GROUP ($SUBSCRIPTION)"
dim "Deployment: $DEPLOYMENT_NAME"

az deployment group create \
  -n "$DEPLOYMENT_NAME" \
  -g "$RESOURCE_GROUP" \
  --template-file "$TEMPLATE" \
  --parameters "$PARAMS" \
  --output none

ok "Deployed $DEPLOYMENT_NAME"

# ─── 5. Outputs ──────────────────────────────────────────────────────────────

info "Outputs"
az deployment group show \
  -n "$DEPLOYMENT_NAME" \
  -g "$RESOURCE_GROUP" \
  --query "properties.outputs" \
  -o json

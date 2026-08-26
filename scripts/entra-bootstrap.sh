#!/usr/bin/env bash
# Converge the Entra External ID application registration and its sign-up flow.
#
#   ./scripts/entra-bootstrap.sh dev --origin https://<public-swa> --origin https://<admin-swa>
#
# Creates what is missing and updates what is not, inside the external tenant of one
# environment. A human runs it, signed in to that tenant: the CI chain cannot, its
# federated identity holding no rights there. Same shape as db-bootstrap-mi.sh.
#
# Options:
#   --origin <url>  Origin of a Static Web App, repeatable, scheme and host only. The
#                   callback path is appended. Without any, the https redirect URIs
#                   already declared are kept as they are.
#
# The script owns the localhost redirect URIs entirely and recomputes them from the
# workspace slots on every run. It owns the https ones only when --origin says which:
# forgetting the flag must never silently unpublish an environment.
#
# The tenant itself is not created here — see docs/deployment.md.
#
# Idempotent: a second run changes nothing and creates no duplicate.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

cd "$ROOT_DIR"

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

ENV_NAME=''
ORIGINS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --origin) [[ $# -ge 2 ]] || { usage >&2; die "--origin needs a value"; }
              ORIGINS+=("$2"); shift 2 ;;
    --origin=*) ORIGINS+=("${1#*=}"); shift ;;
    -*) usage >&2; die "Unknown option '$1'" ;;
    *) [[ -z "$ENV_NAME" ]] || { usage >&2; die "Unexpected argument '$1'"; }
       ENV_NAME="$1"; shift ;;
  esac
done

[[ -n "$ENV_NAME" ]] || { usage >&2; die "Missing environment (dev or prod)"; }

case "$ENV_NAME" in
  dev|prod) ;;
  local) die "There is no external tenant for local. The local loop borrows the dev one — see docs/local-dev.md." ;;
  *) die "Unknown environment '$ENV_NAME' (expected: dev, prod)" ;;
esac

# Every redirect URI of this project ends here, cloud and localhost alike. The front-ends
# have to route it; it is the contract between this script and the applications.
CALLBACK_PATH='/auth/callback'

# One registration per tenant, named for the environment it serves. Uppercased the long way
# round: macOS ships bash 3.2, which has no ${var^^}.
ENV_UPPER="$(printf '%s' "$ENV_NAME" | LC_ALL=C tr '[:lower:]' '[:upper:]')"
APP_NAME="LeHub SPA - $ENV_UPPER"

# The audience the API validates and the scope the applications ask for. Both are names in
# the tenant's own namespace, resolved by nobody, so the two tenants carry them identically.
APP_ID_URI='api://lehub-api'
APP_SCOPE='access_as_user'

TENANT_SUBDOMAIN="lehubextid$ENV_NAME"
GRAPH='https://graph.microsoft.com/v1.0'

# ─── 1. Prerequisites ────────────────────────────────────────────────────────

need_cmd az "Install the Azure CLI, then sign in to the external tenant — see docs/deployment.md"
need_cmd jq "Install jq — the Graph payloads are built with it rather than by string concatenation."
need_cmd curl "Install curl — the tenant is identified through its public OpenID configuration."
# Its substitution sits in an argument position, where a failure does not trip `set -e`: the
# scope would go out with an empty id and come back as an opaque Graph 400.
need_cmd uuidgen "Install uuidgen (util-linux on Linux; already present on macOS)."

for origin in ${ORIGINS[@]+"${ORIGINS[@]}"}; do
  [[ "$origin" == https://* ]] || die "--origin must be an https URL: '$origin'"
  # Anything after the host would end up duplicated against CALLBACK_PATH, producing a URI
  # Entra accepts and no application ever redirects to.
  [[ "${origin#https://}" != */* ]] || die "--origin takes a scheme and a host, no path: '$origin'"
done

# ─── 2. The target tenant ────────────────────────────────────────────────────
# Identified through its public OpenID configuration rather than through Graph: the document
# is anonymous, so this needs no directory permission, and it answers both questions at once
# — whether the tenant exists at all, and which tenant ID it carries.

DISCOVERY="https://$TENANT_SUBDOMAIN.ciamlogin.com/$TENANT_SUBDOMAIN.onmicrosoft.com/v2.0/.well-known/openid-configuration"

info "Resolving $TENANT_SUBDOMAIN.onmicrosoft.com"

DISCOVERY_DOC="$(curl -fsS --max-time 30 "$DISCOVERY" 2>/dev/null)" || die \
  "No external tenant answers at $TENANT_SUBDOMAIN.onmicrosoft.com.
  Create it first — docs/deployment.md, \"The identity tenants\". Creation takes up to
  about thirty minutes, and the tenant is not reachable before it completes."

# The issuer carries the tenant ID twice; the host is the authoritative copy.
EXPECTED_TENANT_ID="$(printf '%s' "$DISCOVERY_DOC" | jq -r '.issuer' | sed -E 's#^https://([^.]+)\..*#\1#')"
[[ "$EXPECTED_TENANT_ID" =~ ^[0-9a-f-]{36}$ ]] || die "Could not read a tenant ID out of $DISCOVERY"

CURRENT_TENANT_ID="$(az account show --query tenantId -o tsv 2>/dev/null || true)"

[[ "$CURRENT_TENANT_ID" == "$EXPECTED_TENANT_ID" ]] || die \
  "Signed in to the wrong tenant.
  expected  $EXPECTED_TENANT_ID  ($TENANT_SUBDOMAIN.onmicrosoft.com)
  current   ${CURRENT_TENANT_ID:-<no session>}
  The external tenant is not the subscription's. Sign in to it:
    az login --tenant $TENANT_SUBDOMAIN.onmicrosoft.com --allow-no-subscriptions"

ok "Signed in to $TENANT_SUBDOMAIN.onmicrosoft.com ($EXPECTED_TENANT_ID)"

# Two different strings, and mixing them up is the kind of failure that only shows up at the
# first sign-in: the client points at the subdomain, the token is issued by the GUID.
AUTHORITY="https://$TENANT_SUBDOMAIN.ciamlogin.com/$EXPECTED_TENANT_ID/v2.0"
ISSUER="$(printf '%s' "$DISCOVERY_DOC" | jq -r '.issuer')"

# infra/main.bicep builds the issuer from the tenant ID alone rather than asking the tenant.
# Two independent derivations of one string, with nothing between them: if they ever part
# company, the API is handed an issuer no token carries and rejects every request while
# looking perfectly healthy. Cheaper to assert here than to debug there.
BICEP_ISSUER="https://$EXPECTED_TENANT_ID.ciamlogin.com/$EXPECTED_TENANT_ID/v2.0"
[[ "$ISSUER" == "$BICEP_ISSUER" ]] || die \
  "This tenant publishes an issuer infra/main.bicep does not derive.
  published  $ISSUER
  derived    $BICEP_ISSUER
  The API would validate tokens against a string none of them carries. Fix entraIssuer in
  infra/main.bicep before going any further."

# Bodies go to `az rest` through files: a Graph payload on a command line would be re-parsed
# by the shell, and a label carrying an apostrophe is enough to break that.
BODY_FILE="$(mktemp "${TMPDIR:-/tmp}/lehub-entra-body.XXXXXX")"
trap 'rm -f "$BODY_FILE"' EXIT

graph() {
  local method="$1" url="$2"
  if [[ -s "$BODY_FILE" ]]; then
    az rest --method "$method" --url "$url" \
      --headers 'Content-Type=application/json' --body "@$BODY_FILE" -o json
  else
    az rest --method "$method" --url "$url" -o json
  fi
}

# ─── 3. The application registration ─────────────────────────────────────────

info "Looking for the application '$APP_NAME'"

APP_MATCHES="$(az ad app list --filter "displayName eq '$APP_NAME'" --query "[].{id:id,appId:appId}" -o json)"
APP_COUNT="$(printf '%s' "$APP_MATCHES" | jq 'length')"

case "$APP_COUNT" in
  0)
    info "Not found — creating it"
    APP_ID="$(az ad app create --display-name "$APP_NAME" --sign-in-audience AzureADMyOrg --query appId -o tsv)"
    APP_OBJECT_ID="$(az ad app show --id "$APP_ID" --query id -o tsv)"
    ok "Created $APP_NAME ($APP_ID)"
    APP_CREATED=true
    ;;
  1)
    APP_ID="$(printf '%s' "$APP_MATCHES" | jq -r '.[0].appId')"
    APP_OBJECT_ID="$(printf '%s' "$APP_MATCHES" | jq -r '.[0].id')"
    dim "Found $APP_ID"
    APP_CREATED=false
    ;;
  *)
    die "$APP_COUNT applications are named '$APP_NAME' in this tenant.
  Refusing to guess which one LeHub uses. Remove the duplicates and run this again."
    ;;
esac

APP_CURRENT="$(az ad app show --id "$APP_ID" -o json)"

# A public client holds no credential at all. Deleting one found here would be a destructive
# surprise, so say it instead — it is also the signal that this registration is not what this
# script thinks it is.
SECRET_COUNT="$(printf '%s' "$APP_CURRENT" | jq '(.passwordCredentials // []) | length')"
[[ "$SECRET_COUNT" -eq 0 ]] || warn \
  "$APP_NAME carries $SECRET_COUNT client secret(s). A public client needs none, and nothing
  in LeHub reads one. Left untouched — remove them from the portal once you know what they served."

# ─── 3a. Redirect URIs ───────────────────────────────────────────────────────

CURRENT_URIS="$(printf '%s' "$APP_CURRENT" | jq -r '(.spa.redirectUris // [])[]')"

DESIRED=()

# Localhost, one pair per workspace slot. Nothing here is read from the machine: the slots
# are a property of the repository, so every contributor's ports are declared whether or not
# that slot exists anywhere yet. LEHUB_MAX_SLOTS and the bases come from lib/workspace.sh.
if [[ "$ENV_NAME" == 'dev' ]]; then
  for slot in $(seq 0 $((LEHUB_MAX_SLOTS - 1))); do
    DESIRED+=("http://localhost:$((LEHUB_WEB_PORT_BASE + slot * LEHUB_PORT_STRIDE))$CALLBACK_PATH")
    DESIRED+=("http://localhost:$((LEHUB_ADMIN_PORT_BASE + slot * LEHUB_PORT_STRIDE))$CALLBACK_PATH")
  done
fi

if [[ ${#ORIGINS[@]} -gt 0 ]]; then
  for origin in "${ORIGINS[@]}"; do
    DESIRED+=("$origin$CALLBACK_PATH")
  done
else
  while IFS= read -r uri; do
    [[ -n "$uri" && "$uri" == https://* ]] && DESIRED+=("$uri")
  done <<< "$CURRENT_URIS"
  dim "No --origin given: keeping the https redirect URIs already declared."
fi

# Printed before the write, never after: an https URI silently dropped is an environment
# whose sign-in breaks with no trace of why.
while IFS= read -r uri; do
  [[ -n "$uri" ]] || continue
  printf '%s\n' ${DESIRED[@]+"${DESIRED[@]}"} | grep -qxF "$uri" && continue
  warn "dropping redirect URI $uri"
done <<< "$CURRENT_URIS"

# `printf '%s\n'` with no arguments still prints one empty line, so an empty DESIRED would
# serialise to [""] and declare a redirect URI that is the empty string.
if [[ ${#DESIRED[@]} -eq 0 ]]; then
  DESIRED_JSON='[]'
else
  DESIRED_JSON="$(printf '%s\n' "${DESIRED[@]}" | jq -R . | jq -s 'unique')"
fi
CURRENT_JSON="$(printf '%s' "$APP_CURRENT" | jq '(.spa.redirectUris // []) | unique')"

PUBLIC_CLIENT="$(printf '%s' "$APP_CURRENT" | jq -r '.isFallbackPublicClient // false')"

if [[ "$DESIRED_JSON" == "$CURRENT_JSON" && "$PUBLIC_CLIENT" == 'true' ]]; then
  dim "Redirect URIs and client type already as declared"
else
  jq -n --argjson uris "$DESIRED_JSON" \
    '{spa: {redirectUris: $uris}, isFallbackPublicClient: true}' > "$BODY_FILE"
  graph PATCH "$GRAPH/applications/$APP_OBJECT_ID" >/dev/null
  : > "$BODY_FILE"
  ok "Declared $(printf '%s' "$DESIRED_JSON" | jq 'length') redirect URI(s), public client flows allowed"
fi

# ─── 3b. The API the two front-ends call ─────────────────────────────────────
# One registration is both the client and the resource: that is what "a single application
# identity, whatever the entry point" means. The scope is only ever added, never rewritten —
# changing an enabled scope in place is rejected by Graph, and regenerating its ID would
# revoke every consent already granted.

HAS_SCOPE="$(printf '%s' "$APP_CURRENT" | jq -r --arg v "$APP_SCOPE" '[(.api.oauth2PermissionScopes // [])[] | select(.value == $v)] | length')"

if [[ "$HAS_SCOPE" -gt 0 ]]; then
  dim "Scope $APP_ID_URI/$APP_SCOPE already exposed"
else
  info "Exposing $APP_ID_URI/$APP_SCOPE"
  # Appended to whatever the registration already exposes, never substituted for it. This
  # property replaces the whole collection on write, so declaring one scope would delete any
  # other — along with the consents granted for it — for a registration that had been given a
  # second scope by hand. identifierUris is merged for the same reason.
  jq --arg uri "$APP_ID_URI" --arg scope "$APP_SCOPE" --arg id "$(uuidgen | LC_ALL=C tr '[:upper:]' '[:lower:]')" '
    {
      identifierUris: ((.identifierUris // []) + [$uri] | unique),
      api: {
        oauth2PermissionScopes: ((.api.oauth2PermissionScopes // []) + [{
          id: $id,
          value: $scope,
          type: "User",
          isEnabled: true,
          adminConsentDisplayName: "Access LeHub as the signed-in user",
          adminConsentDescription: "Allows the LeHub applications to call the LeHub API on behalf of the signed-in user.",
          userConsentDisplayName: "Access LeHub on your behalf",
          userConsentDescription: "Allows LeHub to read and write your data in the agenda on your behalf."
        }])
      }
    }' <<< "$APP_CURRENT" > "$BODY_FILE"
  graph PATCH "$GRAPH/applications/$APP_OBJECT_ID" >/dev/null
  : > "$BODY_FILE"
  ok "Exposed $APP_ID_URI/$APP_SCOPE"
fi

# ─── 4. The sign-up flow ─────────────────────────────────────────────────────
# The tedious piece, and the one whose drift is silent: the legacy's costliest defect was a
# claim present in one token and absent from another. Versioning the payload is the
# counter-measure — scripts/entra-userflow.json is the declaration, this is only its carrier.

FLOW_FILE="$ROOT_DIR/scripts/entra-userflow.json"
[[ -f "$FLOW_FILE" ]] || die "Flow payload not found: $FLOW_FILE"

FLOW_NAME="$(jq -r '.displayName' "$FLOW_FILE")"

# The branches the versioned payload actually claims, normalised so the file and the tenant
# can be compared. Everything else in the flow belongs to the tenant rather than to this
# repository — the identity providers above all, which is why they are absent here too.
# `attributes` is dropped from both sides: it is a navigation property Graph derives from the
# collection page and refuses to be handed inline.
flow_shape() {
  jq -S '{
    description,
    onInteractiveAuthFlowStart,
    onAttributeCollection: (.onAttributeCollection | del(.attributes)),
    onUserCreateStart
  }'
}

info "Looking for the sign-up flow '$FLOW_NAME'"

# Filtered here rather than with $filter: the collection holds a handful of flows at most,
# and the endpoint's filtering support is not something to depend on.
FLOWS="$(az rest --method GET --url "$GRAPH/identity/authenticationEventsFlows" -o json)" || die \
  "Cannot read the sign-up flows of this tenant.
  Graph answers 403 when the signed-in account lacks EventListener.ReadWrite.All, or when the
  Azure CLI has not been consented for it in this tenant — see docs/deployment.md."

FLOW_MATCHES="$(printf '%s' "$FLOWS" | jq --arg n "$FLOW_NAME" '[.value[] | select(.displayName == $n)]')"
FLOW_COUNT="$(printf '%s' "$FLOW_MATCHES" | jq 'length')"

case "$FLOW_COUNT" in
  0)
    info "Not found — creating it"
    # The identity providers are the one thing the versioned payload cannot carry, and this
    # is the only place they are ever written: Graph requires the node at creation, so it
    # gets the local account method alone and nothing rewrites it afterwards. That is what
    # lets a federated provider configured in the portal — carrying a secret this repository
    # must never hold — survive every later run.
    #
    # Everything else goes out whole, `attributes` included. Creation is the only operation
    # that binds them and it wants them inline, exactly as the payload declares them. The
    # annotation form `attributes@odata.bind` looks like the modern spelling and is accepted
    # without complaint, but it binds the first attribute and silently drops the rest — which
    # is how a flow ends up showing a given name field it never writes to the directory.
    # Measured against the tenant, not inferred.
    jq '. + {
      onAuthenticationMethodLoadStart: {
        "@odata.type": "#microsoft.graph.onAuthenticationMethodLoadStartExternalUsersSelfServiceSignUp",
        identityProviders: [{ id: "EmailPassword-OAUTH" }]
      }
    }' "$FLOW_FILE" > "$BODY_FILE"
    FLOW_ID="$(graph POST "$GRAPH/identity/authenticationEventsFlows" | jq -r '.id')"
    : > "$BODY_FILE"
    ok "Created the sign-up flow ($FLOW_ID)"
    ;;
  1)
    FLOW_ID="$(printf '%s' "$FLOW_MATCHES" | jq -r '.[0].id')"
    dim "Found $FLOW_ID"

    # Updating cannot bind an attribute: Graph only ever adds one at creation, or through the
    # dedicated attributes endpoint. A PATCH that carries a collection page referencing an
    # unbound attribute is accepted and quietly ignored for that field, so the run would
    # report convergence, change nothing, and repeat forever. Refuse instead, and name it —
    # a field collected but never written to the directory is the very defect this flow is
    # versioned to prevent.
    MISSING_ATTRS="$(jq -r --argjson flow "$(printf '%s' "$FLOW_MATCHES" | jq '.[0]')" '
      [ .onAttributeCollection.attributes[].id ]
      - [ ($flow.onAttributeCollection.attributes // [])[].id ]
      | join(", ")' "$FLOW_FILE")"

    [[ -z "$MISSING_ATTRS" ]] || die \
      "'$FLOW_NAME' does not collect: $MISSING_ATTRS
  An attribute can only be bound when the flow is created, so this script cannot add it and
  refuses to report a convergence it did not perform. Either add it from the portal, or
  delete the flow and run this again to have it recreated from scripts/entra-userflow.json.
  Deleting it signs nobody out — it holds no accounts."

    if [[ "$(flow_shape < "$FLOW_FILE")" == "$(printf '%s' "$FLOW_MATCHES" | jq '.[0]' | flow_shape)" ]]; then
      dim "Sign-up flow already as declared"
    else
      # Everything the file declares except the attribute bindings: creation takes those
      # inline, an update refuses them outright — "The request body is null or in bad format",
      # which names nothing. They are verified above instead.
      jq 'del(.onAttributeCollection.attributes)' "$FLOW_FILE" > "$BODY_FILE"
      graph PATCH "$GRAPH/identity/authenticationEventsFlows/$FLOW_ID" >/dev/null
      : > "$BODY_FILE"
      ok "Sign-up flow converged — email, given name and surname all required"
    fi
    ;;
  *)
    die "$FLOW_COUNT sign-up flows are named '$FLOW_NAME' in this tenant.
  Refusing to duplicate or to guess. Remove the extra ones and run this again."
    ;;
esac

# The local account method has to be there whatever else is. Checked and added, never
# declared: declaring the list would delete every other provider.
CURRENT_FLOW="$(printf '%s' "$FLOWS" | jq --arg id "$FLOW_ID" '.value[] | select(.id == $id)')"
if [[ -n "$CURRENT_FLOW" ]]; then
  HAS_LOCAL="$(printf '%s' "$CURRENT_FLOW" | jq '[(.onAuthenticationMethodLoadStart.identityProviders // [])[] | select(.id == "EmailPassword-OAUTH")] | length')"
  OTHER_IDPS="$(printf '%s' "$CURRENT_FLOW" | jq -r '[(.onAuthenticationMethodLoadStart.identityProviders // [])[] | select(.id != "EmailPassword-OAUTH") | .displayName] | join(", ")')"
  if [[ "$HAS_LOCAL" -eq 0 ]]; then
    warn "The local account method is missing from '$FLOW_NAME'. Add \"Email with password\" from the portal — adding it here would mean rewriting the provider list, which would delete the others."
  fi
  [[ -n "$OTHER_IDPS" ]] && dim "Federated providers left untouched: $OTHER_IDPS"
fi

# ─── 4a. The application this flow serves ────────────────────────────────────

LINKED="$(printf '%s' "$FLOWS" | jq -r --arg id "$FLOW_ID" --arg app "$APP_ID" \
  '[.value[] | select(.id == $id) | (.conditions.applications.includeApplications // [])[] | select(.appId == $app)] | length')"

if [[ "$LINKED" == '0' || "$APP_CREATED" == true ]]; then
  EXISTING_APPS="$(printf '%s' "$FLOWS" | jq --arg id "$FLOW_ID" \
    '[.value[] | select(.id == $id) | (.conditions.applications.includeApplications // [])[]]')"
  jq -n --argjson apps "${EXISTING_APPS:-[]}" --arg app "$APP_ID" \
    '{conditions: {applications: {includeApplications: (($apps + [{appId: $app}]) | unique_by(.appId))}}}' > "$BODY_FILE"
  graph PATCH "$GRAPH/identity/authenticationEventsFlows/$FLOW_ID" >/dev/null
  : > "$BODY_FILE"
  ok "Linked $APP_NAME to '$FLOW_NAME'"
else
  dim "$APP_NAME already served by '$FLOW_NAME'"
fi

# ─── 5. The identifiers to carry ─────────────────────────────────────────────
# None of them is a secret. They travel like every other resource name in this project —
# infra/main.<env>.bicepparam, then app settings for the API and build variables for the two
# front-ends. See docs/deployment.md.

BICEPPARAM="$ROOT_DIR/infra/main.$ENV_NAME.bicepparam"
COMMITTED_CLIENT_ID="$(sed -n "s/^param entraClientId = '\\(.*\\)'.*/\\1/p" "$BICEPPARAM" 2>/dev/null | head -1)"
COMMITTED_TENANT_ID="$(sed -n "s/^param entraTenantId = '\\(.*\\)'.*/\\1/p" "$BICEPPARAM" 2>/dev/null | head -1)"

printf '\n'
info "Identifiers for $ENV_NAME"
dim "subdomain  $TENANT_SUBDOMAIN"
dim "tenant ID  $EXPECTED_TENANT_ID"
dim "client ID  $APP_ID"
dim "authority  $AUTHORITY"
dim "issuer     $ISSUER"
printf '\n'

if [[ -z "$COMMITTED_CLIENT_ID" || -z "$COMMITTED_TENANT_ID" ]]; then
  warn "infra/main.$ENV_NAME.bicepparam declares no entraClientId yet. Add:
    param entraTenantId = '$EXPECTED_TENANT_ID'
    param entraClientId = '$APP_ID'"
elif [[ "$COMMITTED_TENANT_ID" != "$EXPECTED_TENANT_ID" ]]; then
  # Checked as closely as the client ID: a tenant ID copied from the other environment leaves
  # the client ID looking right while every issued token is rejected as coming from elsewhere.
  warn "The tenant ID in infra/main.$ENV_NAME.bicepparam is not this tenant.
    the file holds   $COMMITTED_TENANT_ID
    this tenant is   $EXPECTED_TENANT_ID
  The API would derive its issuer from the wrong tenant and refuse every token."
elif [[ "$COMMITTED_CLIENT_ID" != "$APP_ID" ]]; then
  warn "The client ID changed and has to be carried back — the registration was recreated.
    infra/main.$ENV_NAME.bicepparam holds  $COMMITTED_CLIENT_ID
    this tenant now serves                $APP_ID
  Until it is updated, the API and both applications point at an application that no longer exists."
else
  ok "infra/main.$ENV_NAME.bicepparam already carries these identifiers"
fi

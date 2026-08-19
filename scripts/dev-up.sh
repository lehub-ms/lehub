#!/usr/bin/env bash
# Bring the local LeHub stack from a fresh clone to a ready state.
#
#   ./scripts/dev-up.sh
#
# Idempotent: safe on a fresh clone and on an already-configured workspace. It never
# overwrites a file you have edited.
#
#   1. checks the toolchain (Node per .nvmrc, Docker, func, sqlcmd)
#   2. creates the missing environment files, generating the local SQL password
#   3. installs dependencies for api and both front-ends, and builds the API
#   4. starts SQL Server and waits for it to report healthy
#   5. applies the migrations, then the reference and demonstration data
#
# Then run ./scripts/dev-start.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

cd "$ROOT_DIR"

PACKAGES=(api frontend/lehub.ms frontend/admin.lehub.ms)

# ─── 1. Toolchain ────────────────────────────────────────────────────────────

info "Checking the toolchain"

REQUIRED_NODE="$(tr -d '[:space:]' < .nvmrc)"
need_cmd node "Install Node ${REQUIRED_NODE} — see docs/local-dev.md"
CURRENT_NODE="$(node --version)"           # e.g. v22.23.2
CURRENT_MAJOR="${CURRENT_NODE#v}"; CURRENT_MAJOR="${CURRENT_MAJOR%%.*}"

if [[ "$CURRENT_MAJOR" != "$REQUIRED_NODE" ]]; then
  die "Node ${REQUIRED_NODE} is required, found ${CURRENT_NODE}.
  Azure Functions v4 does not support this version, and the Function App runs Node ${REQUIRED_NODE}.
  With fnm:   fnm use            (reads .nvmrc)
  Without it: brew install fnm && fnm install ${REQUIRED_NODE} && fnm use"
fi
dim "node ${CURRENT_NODE}"

need_cmd docker "Install Docker Desktop — see docs/local-dev.md"
docker info >/dev/null 2>&1 || die "The Docker daemon is not reachable. Start Docker Desktop and retry."
dim "docker running"

need_cmd func "Install the Core Tools: npm install -g azure-functions-core-tools@4"
need_cmd sqlcmd "Install go-sqlcmd: brew install sqlcmd"

# Checked here even though they are used further down or by dev-start/dev-down, so a
# missing one fails at the toolchain gate with guidance rather than as a bare
# "command not found" halfway through. All three ship with macOS; a slim Linux
# container is where they go missing.
need_cmd openssl "Install OpenSSL — needed to generate the local SQL password."
need_cmd perl "Install Perl — needed to template api/local.settings.json."
need_cmd lsof "Install lsof — needed by dev-start.sh and dev-down.sh to manage ports."
ok "Toolchain ready"

# ─── 2. Environment files ────────────────────────────────────────────────────

if [[ -f .env ]]; then
  dim ".env already present, left untouched"
else
  # Generated rather than copied from the template: a working password committed to
  # the repository would be the real one on every default workspace, which the
  # "no plaintext secret in a commit" rule forbids even for test values.
  # The suffix guarantees SQL Server's complexity requirement whatever rand produces.
  GENERATED_PW="$(LC_ALL=C openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)aA1!"
  PW="$GENERATED_PW" perl -pe 's|^MSSQL_SA_PASSWORD=.*$|"MSSQL_SA_PASSWORD=$ENV{PW}"|e' \
    .env.example > .env
  chmod 600 .env
  ok "Created .env with a freshly generated local SQL password"
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a
: "${MSSQL_SA_PASSWORD:?MSSQL_SA_PASSWORD is missing from .env}"

if [[ -f api/local.settings.json ]]; then
  dim "api/local.settings.json already present, left untouched"
else
  cp api/local.settings.json.example api/local.settings.json
  # The password reaches perl through the environment, never through the program
  # text: a value containing @ or $ would otherwise be interpolated away.
  PW="$MSSQL_SA_PASSWORD" perl -i -pe \
    's|<replace-with-MSSQL_SA_PASSWORD-from-\.env>|$ENV{PW}|g' api/local.settings.json
  ok "Created api/local.settings.json (SQL password taken from .env)"
fi

for app in frontend/lehub.ms frontend/admin.lehub.ms; do
  if [[ -f "$app/.env.local" ]]; then
    dim "$app/.env.local already present, left untouched"
  else
    cp "$app/.env.example" "$app/.env.local"
    ok "Created $app/.env.local"
  fi
done

# ─── 3. Dependencies ─────────────────────────────────────────────────────────

for pkg in "${PACKAGES[@]}"; do
  if [[ -d "$pkg/node_modules" ]]; then
    dim "$pkg dependencies already installed"
  else
    info "Installing $pkg dependencies"
    # npm ci is reproducible and refuses a lockfile that drifted from package.json,
    # which is what we want everywhere a lockfile exists.
    if [[ -f "$pkg/package-lock.json" ]]; then
      npm --prefix "$pkg" ci --silent
    else
      npm --prefix "$pkg" install --silent
    fi
    ok "$pkg ready"
  fi
done

# The Functions host resolves dist/functions/*.js at start-up and reports "No job
# functions found" if the directory is not there yet. tsc --watch would produce it a
# few seconds later, but the host only picks it up on its next worker restart, which
# leaves /api answering 404 for about a minute on a fresh clone.
if [[ -d api/dist/functions ]]; then
  dim "api already built"
else
  info "Building the API"
  npm --prefix api run build --silent
  ok "api built"
fi

# ─── 4. Database container ───────────────────────────────────────────────────

info "Starting SQL Server"
docker compose up -d >/dev/null

printf '  waiting for the container to report healthy'
for attempt in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' lehub-sql 2>/dev/null || echo starting)"
  [[ "$status" == "healthy" ]] && { printf '\n'; break; }
  if [[ $attempt -eq 30 ]]; then
    printf '\n'
    die "SQL Server did not become healthy within 150s (last status: $status).
  Inspect it with: docker compose logs sql
  A recurring \"Login failed for user 'sa'\" means the volume was initialised with a
  different password: ./scripts/dev-down.sh --volumes then rerun this script."
  fi
  printf '.'
  sleep 5
done
ok "SQL Server healthy"

# ─── 5. Schema and data ──────────────────────────────────────────────────────

"$SCRIPT_DIR/db-migrate.sh" local
"$SCRIPT_DIR/db-seed.sh" local --demo

printf '\n'
ok "Local stack ready"
dim "Next: ./scripts/dev-start.sh"
dim "  api    http://localhost:7071/api/health"
dim "  web    http://localhost:5173"
dim "  admin  http://localhost:5174"

#!/usr/bin/env bash
# Bring the local LeHub stack from a fresh clone to a ready state.
#
#   ./scripts/dev-up.sh
#
# Idempotent: safe on a fresh clone and on an already-configured workspace. Every working
# tree — the main clone or any `git worktree` — is a workspace with its own database on the
# one shared SQL Server instance.
#
#   1. checks the toolchain (Node per .nvmrc, Docker, func, sqlcmd)
#   2. resolves this workspace — its slot, database and ports — and renders its env files
#   3. installs dependencies for api and both front-ends, and builds the API
#   4. starts SQL Server and Azurite if no other workspace already did
#   5. creates the media container and uploads the demonstration media
#   6. creates this workspace's database, migrates it and seeds it
#
# The derived files — .env, api/local.settings.json — are rewritten on every run rather
# than left untouched: that is what keeps a workspace from drifting from the shared
# instance password or from another workspace's database. Anything else you edit is kept.
#
# Then run ./scripts/dev-start.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

cd "$ROOT_DIR"

# frontend/shared comes first, and the order is not cosmetic: installing an application does
# not populate the node_modules of the package it links with `file:`. The shared package
# resolves its own imports from its real path — theme.css's two @fontsource-variable among
# them, declared nowhere else since it became a package. Without it first, the build fails
# further down on a module that is simply not there.
PACKAGES=(frontend/shared api frontend/lehub.ms frontend/admin.lehub.ms)

# ─── 1. Toolchain ────────────────────────────────────────────────────────────

info "Checking the toolchain"

# .nvmrc is a repository-wide pin: one Node runs the four processes of dev-start.sh, and
# ci.yml/cd.yml hand the same file to actions/setup-node. It therefore holds the
# intersection of what the packages need, and the guard below checks both halves of it —
# neither is redundant:
#
#   major 22    Azure Functions v4 runs the API on Node 22 (api/package.json engines).
#   >= 22.22.0  react-router, in frontend/lehub.ms only, declares engines node >=22.22.0.
#
# Comparing the major against the raw file content — as this guard used to — made the pin
# uncorrectable: writing a full version into .nvmrc then failed for everyone, including
# someone running exactly that version.
REQUIRED_NODE="$(tr -d '[:space:]' < .nvmrc)"
REQUIRED_MAJOR="${REQUIRED_NODE%%.*}"
need_cmd node "Install Node ${REQUIRED_NODE} — see docs/local-dev.md"
CURRENT_NODE="$(node --version)"           # e.g. v22.23.2
CURRENT_VERSION="${CURRENT_NODE#v}"
CURRENT_MAJOR="${CURRENT_VERSION%%.*}"

# sort -V orders versions rather than strings, so 22.9.0 sorts below 22.22.0 as it must.
OLDEST_NODE="$(printf '%s\n%s\n' "$REQUIRED_NODE" "$CURRENT_VERSION" | sort -V | head -1)"

if [[ "$CURRENT_MAJOR" != "$REQUIRED_MAJOR" || "$OLDEST_NODE" != "$REQUIRED_NODE" ]]; then
  die "Node ${REQUIRED_NODE} or a later ${REQUIRED_MAJOR}.x is required, found ${CURRENT_NODE}.
  Azure Functions v4 pins the API to the ${REQUIRED_MAJOR} major, and React Router v8 refuses
  anything below ${REQUIRED_NODE}. .nvmrc carries both constraints at once.
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
# "command not found" halfway through. Both ship with macOS; a slim Linux
# container is where they go missing.
need_cmd openssl "Install OpenSSL — needed to generate the local SQL password."
need_cmd lsof "Install lsof — needed by dev-start.sh and dev-down.sh to manage ports."
ok "Toolchain ready"

# ─── 2. Workspace and environment files ──────────────────────────────────────

# Slot, slug and database of this working tree. Stable from one run to the next, and slot 0
# belongs to the main clone, which therefore keeps `lehub-local` exactly as before.
workspace_resolve
info "Workspace: slot $LEHUB_SLOT, slug $LEHUB_SLUG, database $LEHUB_DB_NAME"
dim "ports: api $LEHUB_API_PORT, web $LEHUB_WEB_PORT, admin $LEHUB_ADMIN_PORT"

# Rendered, not created-if-absent: see workspace_render_env in lib/workspace.sh.
workspace_render_env

# ─── 3. Dependencies ─────────────────────────────────────────────────────────

# node_modules/.package-lock.json is npm's record of what it actually installed, so a
# lockfile newer than it means the tree is stale. Without that second test, pulling a
# branch that adds a dependency leaves node_modules in place and untouched, and the
# bootstrap fails several steps later on a module that is simply not there.
for pkg in "${PACKAGES[@]}"; do
  if [[ -d "$pkg/node_modules" && ! "$pkg/package-lock.json" -nt "$pkg/node_modules/.package-lock.json" ]]; then
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

# ─── 4. Containers ───────────────────────────────────────────────────────────

# Checked before starting anything, so a busy port is reported as itself rather than
# as Docker's bind error halfway through bringing the stack up.
assert_container_port_free lehub-sql 1433
assert_container_port_free lehub-azurite 10000

# One instance for the whole machine: another workspace may legitimately have started it,
# and recreating it under that workspace's feet is not the bootstrap's business.
if instance_running; then
  dim "SQL Server and Azurite already running — shared with every workspace"
else
  info "Starting SQL Server and Azurite"
  compose up -d >/dev/null
fi

wait_for_healthy lehub-sql "SQL Server" "  Inspect it with: docker compose logs sql
  A recurring \"Login failed for user 'sa'\" means the volume was initialised with a
  different password: ./scripts/dev-down.sh --volumes then rerun this script."
ok "SQL Server healthy"

wait_for_healthy lehub-azurite "Azurite" "  Inspect it with: docker compose logs azurite
  A port 10000 already taken by another emulator is the usual cause."
ok "Azurite healthy"

# ─── 5. Media container ──────────────────────────────────────────────────────

# Before the data: the paths db-seed.sh writes are backed by real bytes from the
# first page load — the deployment chain runs the same script in the same order.
# --demo is what adds the placeholders, and only local accepts it.
"$SCRIPT_DIR/blob-seed.sh" local --demo

# ─── 6. Schema and data ──────────────────────────────────────────────────────

# The workspace's own database, on the shared instance. dbo.__migrations lives inside it,
# so a migration applied here never shows up in another workspace's history.
sql_configure local
if instance_db_exists "$LEHUB_DB_NAME"; then
  dim "Database $LEHUB_DB_NAME already exists"
else
  info "Creating database $LEHUB_DB_NAME"
  instance_db_create "$LEHUB_DB_NAME"
  ok "Database $LEHUB_DB_NAME created"
fi

"$SCRIPT_DIR/db-migrate.sh" local
"$SCRIPT_DIR/db-seed.sh" local --demo

printf '\n'
ok "Local stack ready"
dim "Next: ./scripts/dev-start.sh"
dim "  workspace  slot $LEHUB_SLOT, database $LEHUB_DB_NAME"
dim "  api    http://localhost:$LEHUB_API_PORT/api/health"
dim "  web    http://localhost:$LEHUB_WEB_PORT"
dim "  admin  http://localhost:$LEHUB_ADMIN_PORT"
dim "  media  $AZURITE_BLOB_ENDPOINT/$MEDIA_CONTAINER"

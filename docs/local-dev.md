# Local development

From a fresh clone to a running stack in two commands. Everything runs on your machine —
no Azure subscription is needed for the local loop.

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Docker Desktop | any recent | <https://docs.docker.com/desktop/> — must be **running** |
| Node.js | **22.22.0** or a later 22.x | `brew install fnm`, then `fnm install` from the repository root |
| Azure Functions Core Tools | 4.x | `npm install -g azure-functions-core-tools@4` |
| go-sqlcmd | 1.x | `brew install sqlcmd` |
| git | any recent | — |

The version is not a preference, and `.nvmrc` carries two constraints at once. The major must
be 22: Azure Functions v4 no longer supports Node 20 and the Function App runs 22. The patch
floor is 22.22.0: React Router v8, in `frontend/lehub.ms`, declares `engines: node >=22.22.0`.
`scripts/dev-up.sh` checks both, and `engine-strict=true` in each package's `.npmrc` makes
`npm ci` fail rather than warn below the floor — so skipping `dev-up.sh` does not skip the rule.

Add fnm to your shell so `.nvmrc` is picked up when you `cd` into the repository:

```bash
echo 'eval "$(fnm env --use-on-cd --shell zsh)"' >> ~/.zshrc && exec zsh
```

Without that line, run `fnm use` yourself in each new terminal.

Only cloud work needs more: an Azure CLI login and membership in the `sg-lehub-sql-admins`
Entra group. See [docs/deployment.md](deployment.md).

## Getting started

```bash
git clone https://github.com/lehub-ms/lehub.git && cd lehub
./scripts/dev-up.sh        # toolchain checks, env files, dependencies, database
./scripts/dev-start.sh     # api + both web applications
```

Then open <http://localhost:5173>. You should see the demonstration events.

`dev-up.sh` is idempotent: run it whenever you want, it re-creates only what is missing and
never overwrites a file you have edited.

## What runs where

| Process | Port | What it is |
|---|---|---|
| `api` | 7071 | Azure Functions host — `/api/health`, `/api/events` |
| `web` | 5173 | public site, `frontend/lehub.ms` |
| `admin` | 5174 | backoffice, `frontend/admin.lehub.ms` |
| SQL Server | 1433 | Docker container `lehub-sql`, database `lehub-local` |
| Azurite | 10000 | Docker container `lehub-azurite`, blob container `media` |

Both applications call the API **cross-origin**, exactly as they do in production: a Function
App can only be linked to one Static Web App, and LeHub has two, so there is no `/api` proxy
anywhere. That is why the API declares `Host.CORS` in `api/local.settings.json` and why the
Vite ports are strict — an unexpected origin would simply be refused.

`dev-start.sh` stops everything if any one process fails, so a half-running stack never hides
a problem. To stop the whole thing — the three processes *and* the database — run
`./scripts/dev-down.sh`; Ctrl+C in the `dev-start.sh` terminal stops the processes but leaves
the database up, which is usually what you want between two runs.

## Environment files

None of them are committed; `dev-up.sh` creates each from its template.

| File | From | Holds |
|---|---|---|
| `.env` | `.env.example` | the local SQL password, read by Docker Compose and the scripts |
| `api/local.settings.json` | `api/local.settings.json.example` | Functions settings, SQL password propagated from `.env` |
| `frontend/*/.env.local` | `frontend/*/.env.example` | `VITE_API_BASE_URL` |

`VITE_*` values are inlined into the bundle at build time, so they are public by construction:
never put a secret in one.

SQL authentication is used **only** by the local container. Every Azure SQL server in this
project has Entra-only authentication enabled, and the API connects with a managed identity —
there is no application password anywhere in the cloud.

### Media

The database stores media as a **blob path** — `communities/devcom-lyon.svg` — never an absolute
URL, so one dataset is valid locally, on dev and on prod. The API composes the absolute URL
from `MEDIA_BASE_URL`, which is a deployment setting owned by Bicep in the cloud and comes
from `api/local.settings.json` here. It has no default: an absent value fails the request
with an explicit error rather than serving a relative path that would 404 somewhere else.

Locally that endpoint is [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite),
which `docker-compose.yml` starts alongside SQL Server and `dev-up.sh` waits for. The
bootstrap then creates the `media` container with anonymous blob-level read — the same
`publicAccess` the Bicep module provisions — and uploads the demonstration visuals committed
under `db/seed/media`, which `db/seed/demo.sql` references. Logos and banners are therefore
real from the first page load, fetched cross-origin from `127.0.0.1:10000` exactly as they
are fetched from the storage account in Azure.

Community and event visuals are placeholders created for the project. Technology icons are the
official Microsoft product icons, imported from the Claude Design project, which CLAUDE.md
makes the source of truth for anything visual — add one there first. They are trademarks and
not covered by the repository's MIT licence; `db/seed/media/README.md` carries the terms.

Only part of the demonstration rows carry a media path; the rest keep showing the colour
fallbacks, which is what dev and prod actually display.

Nothing configures a credential. The scripts connect with `UseDevelopmentStorage=true`, the
emulator's conventional shortcut, so no storage key exists in any file here — not even a
template. That shortcut is understood by the Azure SDKs and not by the Azure CLI, which is
why `scripts/blob-seed.sh` delegates to a small Node script rather than calling `az`; the
local loop still needs no Azure access at all.

```bash
./scripts/blob-seed.sh local          # create the container, nothing else
./scripts/blob-seed.sh local --demo   # also upload db/seed/media/**
```

Both are idempotent. `dev-down.sh --volumes` wipes the emulator's volume along with the
database, and the next `dev-up.sh` recreates the container and re-uploads everything.

Note also that the **Content-Security-Policy is not served locally**. It lives in each app's
`staticwebapp.config.json`, which only Azure Static Web Apps applies; the Vite dev server
ignores it. A CSP regression — a media domain missing from `img-src`, for instance — is
therefore invisible here and only shows up on a deployed environment.

## Database

The schema is a sequence of migrations, the data is seeded separately. See `db/README.md` for
the conventions and for how to write a migration.

```bash
./scripts/db-migrate.sh local --dry-run   # what would be applied
./scripts/db-migrate.sh local             # apply pending migrations
./scripts/db-seed.sh local --demo         # reference data + demonstration data
```

Inspect the database directly:

```bash
source .env
sqlcmd -S localhost,1433 -U sa -P "$MSSQL_SA_PASSWORD" -C -d lehub-local \
  -Q "SELECT COUNT(*) FROM dbo.Event"
```

### Starting over

```bash
./scripts/dev-down.sh --volumes && ./scripts/dev-up.sh
```

This deletes both data volumes and rebuilds the database from the migrations and seeds, and
the media container from `db/seed/media`. It is
also the fix for a container that will not become healthy after you change the password in
`.env`: SQL Server only applies `MSSQL_SA_PASSWORD` when it initialises an empty data
directory.

## Everyday commands

```bash
npm --prefix api test                     # vitest
npm --prefix api run build                # tsc
npm --prefix frontend/lehub.ms run lint   # eslint
npm --prefix frontend/lehub.ms test
npm --prefix frontend/lehub.ms run build  # tsc -b && vite build
```

Same scripts in `frontend/admin.lehub.ms`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `The Docker daemon is not reachable` | Docker Desktop is not running | Start it, then rerun `dev-up.sh` |
| `Node 22 is required, found v20.x` / `v25.x` | wrong Node on `PATH` | `fnm use` (reads `.nvmrc`), or add the `--use-on-cd` line above |
| Container stuck `unhealthy`, logs repeat `Login failed for user 'sa'` | the volume was initialised with a different password | `./scripts/dev-down.sh --volumes && ./scripts/dev-up.sh` |
| `Port 7071 is already in use` | a previous `dev-start.sh` left the Functions host behind | `./scripts/dev-down.sh` |
| `Port 10000 is needed by the lehub-azurite container` | another storage emulator is running — a standalone `azurite`, or Visual Studio's | stop it, or `lsof -i:10000 -sTCP:LISTEN` to find it |
| `@azure/storage-blob is not installed` | dependencies installed before this package was added — `dev-up.sh` skips `npm ci` when `node_modules` exists | `npm --prefix api ci` |
| Logos and banners missing, pages otherwise fine | the emulator is down, or its volume was removed without rerunning the bootstrap | `docker compose ps`, then `./scripts/dev-up.sh` |
| Browser console: `blocked by CORS policy` | the app is served from an origin the API does not allow | check `Host.CORS` in `api/local.settings.json` lists 5173 and 5174, and that Vite really bound those ports |
| Page shows `Aucune réponse de http://localhost:7071` | the API is not running | check the `api` pane of `dev-start.sh` |
| `EVENTS_FETCH_ERROR` on `/api/events`, `/api/health` still fine | the API is up but the database is not | `docker compose ps`, then `./scripts/dev-up.sh` |
| `MEDIA_BASE_URL must be set…` on `/api/communities` or `/api/events`, `/api/health` reports `mediaConfigured: false` | an `api/local.settings.json` created before the media setting existed — `dev-up.sh` never overwrites an existing one | copy the `MEDIA_BASE_URL` line from `api/local.settings.json.example` into it |
| `0001_….sql changed after it was applied` | a merged migration was edited | revert the file; corrections go in a **new** migration |
| `npm ci` fails on a lockfile mismatch | `package.json` changed without refreshing the lockfile | `npm --prefix <pkg> install`, and commit the lockfile |

## Working without Azure

The whole local loop — database, API, both applications, tests — runs with no Azure access at
all. You only need a subscription and Entra group membership to deploy or to touch a cloud
database.

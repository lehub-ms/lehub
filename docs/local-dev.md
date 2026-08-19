# Local development

From a fresh clone to a running stack in two commands. Everything runs on your machine —
no Azure subscription is needed for the local loop.

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Docker Desktop | any recent | <https://docs.docker.com/desktop/> — must be **running** |
| Node.js | **22** | `brew install fnm`, then `fnm install 22` |
| Azure Functions Core Tools | 4.x | `npm install -g azure-functions-core-tools@4` |
| go-sqlcmd | 1.x | `brew install sqlcmd` |
| git | any recent | — |

Node 22 is not a preference: Azure Functions v4 no longer supports Node 20, and the Function
App runs 22. The version is pinned in `.nvmrc` and `scripts/dev-up.sh` refuses to run on
anything else.

Add fnm to your shell so `.nvmrc` is picked up when you `cd` into the repository:

```bash
echo 'eval "$(fnm env --use-on-cd --shell zsh)"' >> ~/.zshrc && exec zsh
```

Without that line, run `fnm use` yourself in each new terminal.

Only cloud work needs more: an Azure CLI login and membership in the `sg-lehub-sql-admins`
Entra group. See `docs/deployment.md` when it exists.

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

This deletes the data volume and rebuilds the database from the migrations and seeds. It is
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
| Browser console: `blocked by CORS policy` | the app is served from an origin the API does not allow | check `Host.CORS` in `api/local.settings.json` lists 5173 and 5174, and that Vite really bound those ports |
| Page shows `Aucune réponse de http://localhost:7071` | the API is not running | check the `api` pane of `dev-start.sh` |
| `EVENTS_FETCH_ERROR` on `/api/events`, `/api/health` still fine | the API is up but the database is not | `docker compose ps`, then `./scripts/dev-up.sh` |
| `0001_….sql changed after it was applied` | a merged migration was edited | revert the file; corrections go in a **new** migration |
| `npm ci` fails on a lockfile mismatch | `package.json` changed without refreshing the lockfile | `npm --prefix <pkg> install`, and commit the lockfile |

## Working without Azure

The whole local loop — database, API, both applications, tests — runs with no Azure access at
all. You only need a subscription and Entra group membership to deploy or to touch a cloud
database.

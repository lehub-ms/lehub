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
rewrites the files it derives from the workspace — `.env` and `api/local.settings.json` — and
never touches anything else you have edited.

## What runs where

Ports below are the ones a single clone gets — slot 0. A second worktree shifts them; see
[Working on several worktrees](#working-on-several-worktrees).

| Process | Port | What it is |
|---|---|---|
| `api` | 7071 | Azure Functions host — `/api/health`, `/api/events` |
| `web` | 5173 | public site, `frontend/lehub.ms` |
| `admin` | 5174 | backoffice, `frontend/admin.lehub.ms` |
| SQL Server | 1433 | Docker container `lehub-sql`, database `lehub-local` — one instance shared by every workspace, one database each |
| Azurite | 10000 | Docker container `lehub-azurite`, blob container `media` — shared too |

Both applications call the API **cross-origin**, exactly as they do in production: a Function
App can only be linked to one Static Web App, and LeHub has two, so there is no `/api` proxy
anywhere. That is why the API declares `Host.CORS` in `api/local.settings.json` and why the
Vite ports are strict — an unexpected origin would simply be refused.

`dev-start.sh` stops everything if any one process fails, so a half-running stack never hides
a problem. `./scripts/dev-down.sh` stops the three processes; the containers are shared with
every other working tree, so they stay up unless you ask for `--sql`. Ctrl+C in the
`dev-start.sh` terminal does the same thing, which is usually what you want between two runs.

## Working on several worktrees

Every working tree — the main clone and each `git worktree` — is a **workspace**: it gets a
slug taken from its directory name and a numeric slot, assigned by its first `dev-up.sh` and
kept from then on. The main clone always holds slot 0, so nothing about it changes.

Each workspace has **its own database** on the one shared SQL Server instance: `lehub-local`
at slot 0, `lehub-<slug>` after that. Migrations are recorded per database, so applying one on
a branch leaves every other workspace's history alone. Isolating the database rather than the
engine is deliberate — a SQL Server container per worktree would cost about 2 GB of RAM each,
while the useful isolation between branches is the schema and the data. Running a second
container remains the fallback for the one case a database does not cover, testing an engine
version change.

The three ports derive from the slot too, a hundred apart, so slot 0 keeps exactly what the
main clone always had:

| Service | slot 0 | slot 1 | slot 2 | slot 3 |
|---|---|---|---|---|
| `api` | 7071 | 7171 | 7271 | 7371 |
| `web` | 5173 | 5273 | 5373 | 5473 |
| `admin` | 5174 | 5274 | 5374 | 5474 |

```bash
git worktree add ../lehub.worktrees/feat-42-something feat/42-something
cd ../lehub.worktrees/feat-42-something
./scripts/dev-up.sh          # slot 1: database lehub-feat-42-something, ports 7171/5273/5274
./scripts/dev-start.sh       # runs alongside the main clone's stack
```

`api/local.settings.json` and both `.env.local` are rewritten on every `dev-up.sh` **and**
every `dev-start.sh`, so the API's CORS allow-list, the origin each front-end calls and the
port each Vite server binds always agree with the slot. `strictPort` stays on: a busy port is
an error, never a silent slide onto a neighbour's.

Everything else in the stack is scoped to the workspace as well. `dev-start.sh` refuses to
start only when **its own** ports are taken, and says whether the holder is another LeHub
worktree or an unrelated process; `dev-down.sh` ends only its own processes, so stopping one
worktree leaves the others serving.

At most **four** workspaces can exist at once — slot 0 plus three worktrees. Each slot will add
two redirect URIs to declare on the Entra External ID application once local authentication
lands, which is what caps the count. Removing a worktree frees its slot at the next
`dev-up.sh` or `dev-down.sh`.

Stopping is selective, and the containers are opt-in because they belong to the machine rather
than to a workspace:

| Command | Effect |
|---|---|
| `./scripts/dev-down.sh` | stops this workspace's processes; instance and databases untouched |
| `./scripts/dev-down.sh --sql` | also stops the shared containers, keeping their data |
| `./scripts/dev-down.sh --drop-db` | also drops this workspace's database |
| `./scripts/dev-down.sh --volumes` | also deletes the volumes — **every** workspace's data, with a confirmation |

The state shared between workspaces — the slot registry and the SA password — lives in the Git
common directory, `$(git rev-parse --git-common-dir)/lehub-dev`. It is the one place every
working tree shares by construction, and nothing there is ever versioned.

**One clone per machine.** That state is shared by the worktrees of a clone, while the SQL
Server instance, the volume and the ports belong to the machine. A second, independent clone
would resolve as a main working tree too, claim slot 0, and end up on the same ports and the
same `lehub-local` with a second SA password against one volume. Use `git worktree` — that is
what the slots are for. Bootstrapping a second clone against an existing volume stops with an
explanation rather than a stuck container, but it is not a supported layout.

## Testing from a phone or tablet

Everything listens on the loopback by default, so another device on the same network sees
nothing. Exposing the stack is an explicit choice, never the default — a development machine
is not put on the network by accident:

```bash
./scripts/dev-start.sh --network            # address taken from the default route
./scripts/dev-start.sh --network=192.168.1.42
```

The banner prints the address and the URL to type on the device. `LEHUB_NETWORK_HOST` sets it
too, for a shell that always works this way.

Three values follow the address, and all three have to, or the page loads and then half fails:
the API's CORS allow-list, the API origin injected into both applications, and the media base
URL — an image served on the loopback is unreachable from the phone. The loopback origins stay
allowed while the option is on, so the desktop browser keeps working during the test.

Nothing has to be undone afterwards: the environment files are rendered on **every** start, so
the next `./scripts/dev-start.sh` without `--network` puts everything back on the loopback,
including after a Ctrl-C or a killed terminal.

Known limits:

- **Several interfaces** — Wi-Fi, Ethernet, an active VPN. The address comes from the default
  route, which is where a packet leaving this machine would actually go; with a VPN up that is
  the VPN's address, which is rarely what the phone can reach. Pass `--network=<ip>` then.
- **Client isolation.** Guest Wi-Fi and many corporate networks forbid two clients from talking
  to each other. Nothing on this side can work around it; use a phone hotspot instead.
- **The machine's address changes** — a new lease, a network switch — while the stack runs. The
  rendered values still name the old one; stop and start again.

## Environment files

None of them are committed. `.env` and `api/local.settings.json` are **rendered on every**
`dev-up.sh`, from the workspace and from the shared state, rather than created once and left
alone: that is what stops a workspace from drifting onto another one's database, or onto a
password the shared volume was never initialised with.

| File | Rendered how | Holds |
|---|---|---|
| `.env` | rewritten every run | this workspace's slot, slug and database, plus the shared SA password |
| `api/local.settings.json` | managed keys rewritten every run, the rest kept | Functions settings; `SQL_DATABASE`, `SQL_PASSWORD`, `MEDIA_BASE_URL`, `ENTRA_*` and `Host.CORS` are managed |
| `frontend/*/.env.local` | rewritten every run | `VITE_API_BASE_URL`, `VITE_DEV_PORT`, `VITE_DEV_HOST`, `VITE_ENTRA_*` |
| `frontend/*/.env.test` | committed fixture, never rendered | the API origin the tests assert; depends on no server |

The SA password is a property of the **instance**, not of a workspace: SQL Server applies
`MSSQL_SA_PASSWORD` only when it initialises an empty data directory, so every workspace has to
present the same one. It is generated once into the Git common directory, in `0600`, and read
back from there. Generating one per workspace is what used to leave the second worktree's
container stuck unhealthy on `Login failed for user 'sa'`.

`VITE_*` values are inlined into the bundle at build time, so they are public by construction:
never put a secret in one.

SQL authentication is used **only** by the local container. Every Azure SQL server in this
project has Entra-only authentication enabled, and the API connects with a managed identity —
there is no application password anywhere in the cloud.

### Authentication

There is no local identity provider. The local stack **borrows the dev Entra External ID
tenant**, `lehubextiddev.onmicrosoft.com`, and signs users in against it exactly as the deployed
dev environment does. Nothing here is a credential: LeHub's application registration is a public
client and holds no secret at all, so the tenant ID, the client ID and the authority are
identifiers that travel in the clear — they appear in every sign-in URL anyway.

They are read out of `infra/main.dev.bicepparam`, the same file the deployment takes them from,
and rendered into `frontend/*/.env.local` and `api/local.settings.json` on every run. One place
per environment: after a registration is recreated, that file is the only thing to update.
Starting the stack with those values missing fails immediately, naming the cause, rather than
serving two applications that die on the first sign-in.

**Redirect URIs are exact, and Entra will not guess.** Every slot's ports are already declared on
the registration — eight URIs, `http://localhost:<web|admin port>/auth/callback` for slots 0 to
3 — so authentication works from any workspace without touching the tenant. That is what caps
`LEHUB_MAX_SLOTS` at four in `scripts/lib/workspace.sh`: raising it means re-running
`scripts/entra-bootstrap.sh dev`, which recomputes the whole localhost list from that number.

`dev-start.sh --network` is the exception. The phone reaches the applications on
`http://<machine ip>:<port>`, which is not a declared redirect URI and will be refused. Testing a
signed-in page from a phone needs that origin added to the registration deliberately; browsing
the public pages does not.

### Media

The database stores media as a **blob path** — `communities/devcom-lyon.svg` — never an absolute
URL, so one dataset is valid locally, on dev and on prod. The API composes the absolute URL
from `MEDIA_BASE_URL`, which is a deployment setting owned by Bicep in the cloud and comes
from `api/local.settings.json` here. It has no default: an absent value fails the request
with an explicit error rather than serving a relative path that would 404 somewhere else.

Locally that endpoint is [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite),
which `docker-compose.yml` starts alongside SQL Server and `dev-up.sh` waits for. The
bootstrap then creates the `media` container with anonymous blob-level read — the same
`publicAccess` the Bicep module provisions — and uploads the visuals committed under
`db/seed/media`, which the seed files reference. Logos and banners are therefore real from
the first page load, fetched cross-origin from the emulator's port `10000` exactly as they
are fetched from the storage account in Azure.

What is uploaded comes in two tiers, and the top-level folder decides which. The technology
icons under `technologies/` are **reference media**: `db/seed/reference.sql` points at them
and they reach every environment, so `blob-seed.sh` uploads them with no flag. The community
and event placeholders are **demonstration media**, referenced by `db/seed/demo.sql`, gated
behind `--demo`, and accepted for `local` only — one notch stricter than `db-seed.sh`, which
lets the fictitious *rows* live on `dev`. `api/test/seedMedia.test.ts` fails if a tier names
the other's media, or if a path and its file drift apart.

Community and event visuals are placeholders created for the project. Technology icons are the
official Microsoft product icons, imported from the Claude Design project, which CLAUDE.md
makes the source of truth for anything visual — add one there first. They are trademarks and
not covered by the repository's MIT licence; `db/seed/media/README.md` carries the terms.

Only part of the rows carry a media path — the technologies the design project publishes no
icon for, and most of the demonstration entities. The rest keep showing the colour fallbacks,
which is what dev and prod mostly display.

Nothing configures a credential. Locally the scripts connect with
`UseDevelopmentStorage=true`, the emulator's conventional shortcut, so no storage key exists
in any file here — not even a template. That shortcut is understood by the Azure SDKs and
not by the Azure CLI, which is why `scripts/blob-seed.sh` delegates the local upload to a
small Node script; against a real account it calls `az` directly, with the ambient `az login`
session. Either way the local loop needs no Azure access at all.

```bash
./scripts/blob-seed.sh local          # container + the reference icons
./scripts/blob-seed.sh local --demo   # also upload the placeholders
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

### Making yourself an administrator

The backoffice reserves its global-administration section to accounts carrying the
administrator marker, and that marker cannot be granted from the backoffice — there would be
nobody to grant the first one. `LEHUB_BOOTSTRAP_ADMIN_EMAILS` is how an environment names its
first administrators, local included:

```bash
export LEHUB_BOOTSTRAP_ADMIN_EMAILS=you@example.com   # commas or spaces for several
./scripts/db-seed.sh local --demo
```

It is read from the environment rather than from `.env`, which every `dev-up.sh` and
`dev-start.sh` rewrites — put the export in your shell profile if you want it to stick.

The seed only *registers* the address: the promotion happens the next time that account signs
in on `lehub.ms`, so sign in once before expecting the backoffice to open. Registering an
address that has never signed in is normal and is not an error. Replaying the seed never
promotes anyone twice, which is what lets you remove an administrator from the backoffice
without the next seed silently putting them back.

Inspect the database directly:

```bash
source .env
sqlcmd -S localhost,1433 -U sa -P "$MSSQL_SA_PASSWORD" -C -d "$LEHUB_DB" \
  -Q "SELECT COUNT(*) FROM dbo.Event"
```

### Starting over

For this workspace alone:

```bash
./scripts/dev-down.sh --drop-db && ./scripts/dev-up.sh
```

For the whole machine — every workspace's database and the media container:

```bash
./scripts/dev-down.sh --volumes && ./scripts/dev-up.sh
```

`--volumes` deletes the shared volumes, so it asks for confirmation as soon as another
workspace has a database on the instance. It is also the only way out once the shared SA
password has been lost: SQL Server applies `MSSQL_SA_PASSWORD` solely when it initialises an
empty data directory, so no new password can ever authenticate against an existing volume.

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
| `Node 22.22.0 or a later 22.x is required` | wrong Node on `PATH` | `fnm use` (reads `.nvmrc`), or add the `--use-on-cd` line above |
| Container stuck `unhealthy`, logs repeat `Login failed for user 'sa'` | the volume was initialised with a password no workspace holds any more | `./scripts/dev-down.sh --volumes && ./scripts/dev-up.sh` |
| `Port 7171 is held by the LeHub workspace at slot 1` | another worktree is already serving | run `./scripts/dev-down.sh` **in that worktree** — from here it would not reach its processes |
| `Port 7071 is held by a process unrelated to LeHub` | something else on the machine took it | `lsof -i:7071 -sTCP:LISTEN` to identify it, then stop it |
| `Port 10000 is needed by the lehub-azurite container` | another storage emulator is running — a standalone `azurite`, or Visual Studio's | stop it, or `lsof -i:10000 -sTCP:LISTEN` to find it |
| `@azure/storage-blob is not installed` | dependencies installed before this package was added — `dev-up.sh` skips `npm ci` when `node_modules` exists | `npm --prefix api ci` |
| Logos and banners missing, pages otherwise fine | the emulator is down, or its volume was removed without rerunning the bootstrap | `docker compose ps`, then `./scripts/dev-up.sh` |
| Browser console: `blocked by CORS policy` | the app is served from an origin the API does not allow | rerun `./scripts/dev-start.sh`, which re-renders `Host.CORS` from this workspace's slot; check it lists the ports Vite actually bound |
| Page shows `Aucune réponse de http://localhost:<port>` | the API is not running | check the `api` pane of `dev-start.sh` |
| `EVENTS_FETCH_ERROR` on `/api/events`, `/api/health` still fine | the API is up but the database is not | `docker compose ps`, then `./scripts/dev-up.sh` |
| `MEDIA_BASE_URL must be set…` on `/api/communities` or `/api/events`, `/api/health` reports `mediaConfigured: false` | the setting was removed by hand from `api/local.settings.json` | rerun `./scripts/dev-start.sh` — `MEDIA_BASE_URL` is a managed key, rendered on every run |
| `0001_….sql changed after it was applied` | a merged migration was edited | revert the file; corrections go in a **new** migration |
| `npm ci` fails on a lockfile mismatch | `package.json` changed without refreshing the lockfile | `npm --prefix <pkg> install`, and commit the lockfile |

## Working without Azure

The whole local loop — database, API, both applications, tests — runs with no Azure access at
all. You only need a subscription and Entra group membership to deploy or to touch a cloud
database.

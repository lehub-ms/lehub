# CLAUDE.md — LeHub

## Project

LeHub is the community agenda of French-speaking Microsoft communities: a public SPA listing
meetups, conferences and webinars, plus an admin backoffice for community organizers.
Volunteer-run, open source (MIT), hosted 100% on Azure under a ~25 €/month design cap — every
new Azure resource must be justified against that budget before it lands in `/infra`. The
Azure budgets in `/infra` are tripwires set above that cap, not the cap itself: 15 € on dev,
50 € on prod, whose 50% alert lands exactly on the 25 €. See `docs/deployment.md`.

## Repository layout

```
/infra                       IaC Bicep: main.bicep + modules/ + main.<env>.bicepparam
/db                          SQL: versioned migrations, seed data, Entra user bootstrap
/api                         Azure Functions v4 (TypeScript, Node 22) — shared by both frontends
/frontend/lehub.ms           Public SPA (React 19 + Vite)
/frontend/admin.lehub.ms     Admin backoffice SPA (React 19 + Vite)
/docs                        Technical docs: local dev, deployment, ADRs
/scripts                     Bash tooling: db init, MI bootstrap, local dev orchestration
                             (one Node helper, for the Azure SDK the CLI cannot replace)
/.github                     Workflows, issue templates, PR template
```

Nothing else at the repository root. No `specs/`, no `.specify/`, no `.azure/`, no `preview/`,
no generated `main.json`. Adding a new top-level directory requires an explicit discussion with
the maintainer first — propose it, do not create it.

## Stack

| Layer | Technology | Version / notes |
|---|---|---|
| Public + admin SPA | React + Vite | React 19, Vite 8 |
| Language | TypeScript | `strict: true`, no `any`, no `@ts-ignore` |
| Styling | Tailwind CSS | v4 via `@tailwindcss/vite` — no other CSS framework, no CSS-in-JS |
| Components | Radix UI Primitives + `clsx` + `tailwind-merge` | headless, accessible |
| Icons | Lucide React | only icon library; never emojis as UI icons. v1 dropped every brand mark, so GitHub/LinkedIn logos are inline SVG |
| Fonts | `@fontsource-variable/*` | Space Grotesk (headings, max weight 700) + DM Sans (body), self-hosted so the CSP stays at `font-src 'self'` |
| Routing | React Router | v8 — ESM-only, library/SPA mode; never `react-router-dom` (removed in v8) |
| Auth (client) | `oidc-client-ts` | Entra External ID, PKCE |
| API | Azure Functions v4 | Node 22, TypeScript, Linux, FC1 Flex Consumption |
| SQL driver | `mssql` | Managed Identity in cloud, SQL auth locally only |
| JWT validation | `jose` | remote JWKS, cached |
| Database | Azure SQL Database | Basic (prod) / `GP_S_Gen5_1` serverless auto-pause 60 min (dev) |
| Hosting (web) | Azure Static Web Apps Free | two SWA per environment; Standard buys only `linkedBackend`, which is impossible here |
| Identity | Microsoft Entra External ID | sole IdP; no custom credential storage |
| Secrets | Azure Key Vault | none exist in the current scope, so `/infra` provisions no vault |
| IaC | Bicep | hand-written modules in `infra/modules/`; no AVM — see `docs/deployment.md` |
| CI/CD | GitHub Actions | OIDC federated credentials, no static Azure secrets |
| Observability | Application Insights + Log Analytics | enabled in every environment |
| Tests | Vitest | both `/api` and each frontend |
| Region | `westeurope` | the only authorized region |

## Commands

Run per-directory commands with `npm --prefix <dir>` from the repo root.

```bash
# Frontends (same scripts in frontend/lehub.ms and frontend/admin.lehub.ms)
npm --prefix frontend/lehub.ms run dev        # Vite dev server
npm --prefix frontend/lehub.ms run build      # tsc -b && vite build
npm --prefix frontend/lehub.ms run lint       # eslint
npm --prefix frontend/lehub.ms test           # vitest run

# API
npm --prefix api run dev                      # tsc --watch + func start
npm --prefix api run build                    # tsc
npm --prefix api test                         # vitest run

# Local full stack
./scripts/dev-up.sh                           # idempotent bootstrap (toolchain + env + deps + db)
./scripts/dev-start.sh [--network]            # run api + web + admin on this workspace's ports
./scripts/dev-down.sh [--sql|--drop-db|--volumes]  # stop this workspace; see docs/local-dev.md

# Database (any environment)
./scripts/db-migrate.sh local|dev [--dry-run] # apply pending db/migrations/*.sql
./scripts/db-seed.sh local|dev [--demo]       # reference data, + demo data on request

# Media storage (the container itself is provisioned by Bicep; this only writes blobs)
./scripts/blob-seed.sh local|dev [--demo]     # reference icons, + demo visuals (local only)

# Infrastructure (resource groups are created by hand, never by Bicep)
./scripts/infra-deploy.sh dev --what-if       # preview, changes nothing
./scripts/infra-deploy.sh dev                 # apply infra/main.dev.bicepparam
./scripts/db-bootstrap-mi.sh dev              # grant the managed identity on the database

# Identity (Microsoft Graph objects, not ARM — a human runs it, signed in to the
# external tenant with `az login --tenant ... --allow-no-subscriptions`)
./scripts/entra-bootstrap.sh dev --origin https://<swa> --origin https://<swa-admin>
```

Requires: Docker, Node via `fnm` (`.nvmrc` pins `22.22.0`, the intersection of the API's
major-22 ceiling and React Router v8's floor; enforced by `dev-up.sh` and by `engine-strict`
in each package's `.npmrc`), `func` (Core Tools 4), Azure CLI 2.60+,
`az bicep`, `go-sqlcmd`, `gh`, `jq` (Graph payloads are built with it, never by string
concatenation), membership in the `sg-lehub-sql-admins` Entra group for any cloud DB operation,
and `EventListener.ReadWrite.All` in the external tenant for `entra-bootstrap.sh`. Setup
instructions live in `docs/local-dev.md`.

Two deliberate absences, both settled — do not reintroduce either:

- **No root `package.json`.** `/scripts` orchestrates; `concurrently` is consumed from
  `api/node_modules` rather than installed globally.
- **No `swa start` proxy and no Vite dev proxy.** A Function App can only be linked to one
  Static Web App, so both front-ends call the API cross-origin in every environment, and the
  local loop must exercise that same path rather than hide it.

## Workflow

1. **Issue first.** Every change starts from a GitHub issue. No issue, no branch.
2. **Plan mode.** Enter plan mode (`EnterPlanMode`) and get explicit approval before:
   any infra/Bicep change, any DB schema or migration change, any new API endpoint or auth
   change, any new page or multi-file frontend feature, any dependency addition, anything
   touching CI/CD. Go straight to implementation for: single-file bug fixes, copy/label
   changes, test additions, doc edits, dependency version bumps already discussed.
3. **Implement** on a branch dedicated to the **Feature**, one commit per sub-issue.
4. **Test.** `vitest` in `/api` and in the touched frontend must pass before pushing.
5. **Review.** Run `/code-review` on the diff and resolve findings before opening the PR.
6. **Ship.** PR → `develop` → recette → release PR `develop` → `main`. `main` is
   protected — never commit to it.

Branches, commits, PR bodies, GitHub Project statuses, releases and hotfixes are **owned by
the `github-workflow` skill** (`.claude/skills/github-workflow/SKILL.md`) — read it before any
git or `gh` operation. Do not restate its rules here.

## Design system

The **Claude Design project `lehub.ms/`** is the source of truth for anything visual: every
change of look or UX starts there, then lands in the repo. Do not create a `/design` directory
or a design skill in this repo — the mock-ups are not committed here, and generated HTML
previews remain an anti-pattern.

Its `lehub.ms/icons/` holds the official Microsoft product icons and the technology reference
they belong to. They are imported into `db/seed/media/technologies/` for the local loop, and
they are trademarks, not MIT-licensed assets — see `db/seed/media/README.md`. A new technology
icon is added to the design project first.

Tokens live in exactly one place: the `@theme` block of `frontend/lehub.ms/src/index.css`.
Colours are `--color-*`, families are `--font-*`, and Tailwind derives `bg-primary`,
`text-ink-muted`, `font-heading` from them. Repeated composites (`glass`, `glass-strong`,
`text-gradient`) are Tailwind `@utility` rules in the same file; hand-written CSS is reserved
for what a utility genuinely cannot express (the background mesh, `:focus-visible`).

Two tokens deliberately diverge from the mock-ups, because WCAG AA outranks visual fidelity:

- `--color-ink-muted` is `#63738a`, not the mock-up's `#64748b`, which measures 4.47:1 on the
  canvas and misses the 4.5:1 floor.
- `--color-primary-light` (`#4d9fde`, 2.69:1) is **decorative only** — gradients and the mesh.
  Never text. Section labels use `--color-primary` (5.92:1).

Both corrections are owed back to the Claude Design project.

## GitHub Issues

The issue is the single unit of work: it holds the *what* and the acceptance criteria; the
*how* lives in the code and the PR.

**Hierarchy** — every issue carries a native GitHub Issue Type (configured org-wide on
`lehub-ms`: `Epic`, `Feature`, `Story`, `Bug`, `Task`) and, except epics, a native parent set
via GitHub sub-issues. Never encode this as an `area:`/`type:`/`prio:` label — this repo does
not use custom classification labels.

- `Epic` — top-level initiative, no parent (e.g. #1, #2). Title prefixed `👑`.
- `Feature` — a scoped slice of an epic; parent MUST be that epic. Title prefixed `🚀`.
- `Story` — a unit of implementation; parent MUST be the feature it belongs to. No prefix.
- `Bug` — a defect; parent MUST be the feature it belongs to. No prefix.
- `Task` — not yet in active use; define its rules here before relying on it.

Set both the type and the parent when an issue is created — a `Feature` left without its
epic as parent, or an issue left with the default (no) type, is incomplete.

**Tracking** — every work issue lives in the `lehub-ms` GitHub Project; its `Status` field is
the single view of where a change stands, from `Todo` to `Done`. The transitions and the `gh
project` commands belong to the `github-workflow` skill.

**Qualified issues (specs)** — an `Epic`, `Feature`, or `Story` also carries the `qualified`
label once its description is complete enough to serve as a spec. "Spécifier X" / "amender la
spec de X" always means working on a `qualified` issue of one of these three types. `Bug`
issues are never `qualified`.

**Issue format** — French, per type, no template ceremony beyond this:

- **Epic**: `## Objectif`, `## Valeur`, `## Périmètre` (with `### Inclus` / `### Exclu`
  subsections). No parent, so no acceptance criteria.
- **Feature**: `## Contexte`, `## Comportement attendu`. No `Critères d'acceptation` — that
  detail lives in its Stories. May link to related issues or note scope handled by another
  feature.
- **Story**: concise, precise title. Body opens with "En tant que ..., je veux ..., afin
  de ...", then a precise but non-verbose description of the behavior and business rules,
  followed by `## Critères d'acceptation` and `## Edge cases`.
- **Bug**: concise, precise title. Body describes the bug, the affected screen, the observed
  vs. expected behavior, and the reproduction steps.

Branch naming, commit format and PR rules live in the `github-workflow` skill.

**Canonical `gh` commands for issues** (issue type and parent are not `gh` flags — set them
via the `lehub-spec` skill, which wraps the GraphQL calls in
`.claude/skills/lehub-spec/scripts/set-issue-hierarchy.sh`):

```bash
gh issue create --title "..." --body-file <file> --label qualified   # Epic/Feature/Story
gh issue create --title "..." --body-file <file>                     # Bug
gh issue list --state open
gh issue view <n>
gh issue comment <n> --body "..."
gh issue close <n>
```

The Feature is the **unit of delivery**; Stories and Bugs remain the unit of specification and
carry the acceptance criteria. One Feature → one branch → one PR grouping its sub-issues — a
lone `Bug` ships under its parent Feature too. See the `github-workflow` skill.

## Non-negotiables

These are enforceable rules; a PR violating one does not merge.

- All traffic over TLS. Plaintext HTTP is redirected or rejected.
- Every authenticated API request validates its Entra External ID JWT server-side (signature,
  issuer, audience, expiry). No client-side-only trust decision, ever.
- Application access to Azure SQL uses Managed Identity. `azureADOnlyAuthentication` is on; no
  application SQL login or password exists in any environment. Local Docker SQL is the only
  place SQL auth is allowed.
- Secrets live in Key Vault and reach app settings as `@Microsoft.KeyVault(SecretUri=...)`
  references resolved by the user-assigned managed identity. No plaintext secret in an app
  setting, a bicepparam, a workflow file, or a commit — including test values.
- RBAC assignments are least-privilege and scoped to the resource, never the subscription.
- CI/CD authenticates to Azure via OIDC federated credentials. No static Azure credential in
  GitHub secrets.
- Security-relevant events (auth failures, authorization denials, anomalous access) are logged
  to Application Insights.
- WCAG 2.1 AA: text contrast ≥4.5:1 (≥3:1 for large text; logotypes are exempt per 1.4.3),
  visible focus states, keyboard navigation, interactive targets ≥44×44px on mobile, semantic
  landmarks, `alt` on every meaningful image.
- Security headers (CSP, X-Frame-Options, restrictive CORS) configured on both SWA and the
  Function App.
- Known CVEs in dependencies are fixed before any new feature merges.

## Conventions

- **Azure resource names**: `<abbr>-lehub-<env>` where `<env>` is `dev` or `prod` —
  `swa-lehub-<env>` (public), `swa-admin-lehub-<env>` (backoffice), `func-lehub-<env>`,
  `sql-lehub-<env>`, `id-lehub-<env>`, `appi-lehub-<env>`, `log-lehub-<env>`,
  `asp-lehub-<env>-func`. Globally-unique names append a hash:
  `kv-lehub-<env>-<uniqueString:5>`, `stlehub<env><uniqueString:6>` (Function App host
  storage) and `stlehubmedia<env><uniqueString:6>` (public media). Resource groups:
  `rg-lehub-<env>`. Tags `env` and `project=lehub` on everything.
- **Identity tenants**: `lehubextid<env>.onmicrosoft.com` in `rg-lehubextid-<env>`, deliberately
  outside `rg-lehub-<env>` — resetting an environment empties that group, and an identity tenant
  in the blast radius would take every account with it. Created by hand, never in Bicep; see
  `docs/deployment.md`.
- **Branches**: `main` = production (CD → Azure prod), `develop` = integration (CD → Azure
  dev). Naming and flow: `github-workflow` skill.
- **TypeScript strict** everywhere, both frontends and the API. No `any`, no `@ts-ignore`.
- **Language**: code, comments, technical docs, commit messages in English. Issues, PR
  descriptions, reviews, and UI copy in French.
- **DCO**: every commit carries `Signed-off-by:` (`git commit -s`).
- **Two Static Web Apps per environment** sharing a single Function App is the notable
  departure from the legacy single-SWA topology. `/infra` must handle it explicitly — the
  backend linking strategy, per-SWA `staticwebapp.config.json`, admin route protection, and
  the CORS/auth consequences of one API serving two origins are design decisions to make and
  document there, not to silently inherit from the legacy `linkedBackend` module.

## Anti-patterns

Things this repo deliberately does not do:

- **spec-kit**: no `speckit-*` skills, no `spec.md` / `plan.md` / `tasks.md` templates, no
  `00X-feature-name` numbering, no `.specify/` directory. Issues replaced all of it.
- **Generated HTML previews**: no `preview/*.html`, no UI-generator skill output committed.
- **Secrets in app settings**, bicepparams, or workflow files — Key Vault references only.
- **SQL login + password** for application runtime access.
- **Duplicating the README** into CLAUDE.md, or duplicating CLAUDE.md into `/docs`. Each fact
  lives in exactly one file.
- **Auto-generated "Recent Changes" / "Active Technologies" sections** in this file. Git
  history is the changelog. This file only contains rules that are verifiable in the repo or
  that change a coding decision.
- **Committing build output**: no `dist/`, no compiled `infra/main.json`.
- **Manual portal changes** to production. Everything goes through Bicep and CI.

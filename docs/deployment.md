# Deployment

Everything LeHub runs on is described in `/infra` as Bicep. A deployment against an
empty resource group produces a complete environment; the same command replayed
produces no change.

## Prerequisites

| Tool / access | Why |
|---|---|
| Azure CLI 2.60+ | `az deployment group` |
| `az bicep` | compiles the template — `az bicep install` |
| go-sqlcmd 1.x | migrations, seed and the managed identity bootstrap |
| Owner on the resource group | the deployment creates role assignments |
| Member of `sg-lehub-sql-admins` | the only way into any cloud database |

Sign in with `az login` and check the subscription with `az account show`.

## Environments

| | dev | prod |
|---|---|---|
| Resource group | `rg-lehub-dev` | `rg-lehub-prod` |
| Region | `westeurope` | `westeurope` |
| SQL SKU | `GP_S_Gen5_1`, serverless, auto-pause 60 min | `Basic`, always on |
| Always-ready API instances | 0 | 1 |
| CORS allow-list | both Static Web Apps + `localhost:5173` / `5174` | both Static Web Apps |
| Estimated cost | ~5-10 €/month, usage-driven | ~4.30 €/month for SQL, plus usage |

**Resource groups are created by hand**, in `westeurope`, and are never described in
Bicep: the template targets the group scope, so it cannot create the group it deploys
into. `infra-deploy.sh` refuses to run against a group that does not exist rather than
guessing a region.

```bash
az group create -n rg-lehub-prod -l westeurope --tags env=prod project=lehub
```

`infra-deploy.sh` also refuses a group outside `westeurope`. The template takes its
location from the group, so the group's region silently becomes the region of the whole
environment — and a template cannot check a choice that was made before it ran.

## Cost guardrails

The budget shapes this project, so three things enforce it rather than describing it.

| Guard | dev | prod | What it does |
|---|---|---|---|
| `Microsoft.Consumption/budgets` | 15 € | 50 € | alerts at 50 / 80 / 100 % of actual spend, and at 100 % of *forecast* |
| `maximumInstanceCount` | 10 | 20 | ceiling on API scale-out, so a hammered endpoint cannot scale the bill |
| Log Analytics `dailyQuotaGb` | 0.5 | 0.5 | stops ingestion for the rest of the UTC day |

The amounts sit above expected spend on purpose — dev is estimated at 5-10 €/month and
prod at 4.30 € plus usage — so that a notification means something is wrong rather than
that the month was busy. Prod's 50 % threshold lands on 25 €, the figure the project
budgets for itself as a whole. Notifications go to the **Owner role** on the resource
group, not to an address: nothing has to be updated when a contact changes, and no
personal address is committed to a public repository.

The forecast alert is the only one that can still be acted on. The other three report
money already spent.

**The daily cap has a cost of its own.** Reaching it stops *all* ingestion until midnight
UTC, including the SQL security audit — protecting the bill can leave a hole in the
security log. The cap is a runaway guard, not a target: real volume here is a few
megabytes a day, and 0.5 GB/day sustained would cost more than the environment's entire
budget. The platform's minimum is 0.023 GB/day if it ever needs tightening.

## Accepted risks

Written down so they are decisions rather than discoveries.

| Risk | Why it is accepted |
|---|---|
| No blob soft delete or versioning **on the host storage** | that account holds the deployment package, which a redeployment rebuilds. The media account is the opposite case and keeps 7-day blob and container retention |
| No versioning on the media account | retention covers a deletion; overwriting a logo with a newer one is the intended operation, not an accident to undo |
| Point-in-time restore only, 7 days on prod Basic | long-term retention is billed per GB and the data is re-seedable |
| No regional DR, no zone redundancy | a community agenda tolerates hours of downtime; geo-redundancy does not fit the budget |
| Storage reachable from any network | `allowSharedKeyAccess: false` means Entra is the barrier, not the network |
| The media container is readable by anyone | that is what serving public logos means. `publicAccess: 'Blob'` grants reads on a known blob name and not container listing, so the container is not an inventory of what the site references |
| SQL reachable from any Azure IP | a private endpoint is ~7 €/month; `azureADOnlyAuthentication` is the real guard |
| Microsoft Defender for Cloud, beyond the free tiers | Defender for SQL ~13 €, Storage ~10 €, App Service ~15 € per month — together more than the whole budget |

The SQL audit is what replaces Defender for SQL: successful and failed authentications
are written to `log-lehub-<env>`. It is deliberately narrow — the default audit groups
include `BATCH_COMPLETED_GROUP`, which records every statement the API runs and would be
an ingestion bill rather than a security log.

```kusto
AzureDiagnostics
| where Category == "SQLSecurityAuditEvents"
| where action_name_s startswith "DATABASE AUTHENTICATION"
| project TimeGenerated, action_name_s, succeeded_s, server_principal_name_s, client_ip_s
```

## Deploying

Merging to `develop` deploys dev without any of this — see "Continuous deployment"
below. The commands here are for previews, for a first deployment on a fresh
subscription, and for prod as long as no pipeline targets it.

```bash
./scripts/infra-deploy.sh dev --what-if     # preview, changes nothing
./scripts/infra-deploy.sh dev               # apply
./scripts/infra-deploy.sh prod --what-if    # validate the production parameters
```

Applying to prod types the resource group name back before anything happens.

A second `--what-if` straight after a deployment reports **ten resources to modify**, and
none of them is drift. Every one is the resource provider normalising something, or
`what-if` being unable to evaluate an expression before the deployment runs. Anything
*outside* this list is the bug:

| Resource | Reported | Why |
|---|---|---|
| `budgets/budget-lehub-dev` | `startDate`, `endDate` | the start date is `utcNow()`, which `what-if` cannot resolve; the API defaults an end date ten years out |
| `components/appi-lehub-dev` | `Flow_Type`, `Request_Source` | stamped by the provider on creation |
| `auditingSettings/default` | `isManagedIdentityInUse`, `retentionDays`, `storageAccountSubscriptionId` | storage-target properties the provider fills in even for an Azure Monitor target |
| `diagnosticSettings/sqlAudit` | `metrics`, ten disabled log categories | the provider expands the category list to every category the resource supports |
| `containers/deployments` | `defaultEncryptionScope`, `denyEncryptionScopeOverride` | account-level encryption defaults, applied to every container |
| `containers/media` | `defaultEncryptionScope`, `denyEncryptionScopeOverride` | the same two, on the media account's container. Neither the media account nor its `blobServices/default` appears here — the exhaustive properties block is what keeps them out |
| `sites/func-lehub-dev` | `siteConfig.*` | `what-if` compares an unexpanded `siteConfig`, so CORS and `ftpsState` read as additions |
| `config/appsettings` | `properties` | the settings are built from `reference()`, which has no value until the deployment runs |
| both `staticSites` | `deploymentAuthPolicy`, `provider`, `stableInboundIP`, `trafficSplitting` | assigned by the provider; the template does not set them |

Re-measure this table rather than trusting it. Each line is a property the template does
not own, and taking ownership of one removes its line — which is exactly how the plan's
`kind` and the blob retention policy stopped appearing here.

## After a first deployment

Bicep provisions the database; it never puts anything in it.

```bash
./scripts/db-migrate.sh dev          # schema
./scripts/db-seed.sh dev --demo      # reference data, plus demo data
./scripts/db-bootstrap-mi.sh dev     # let the API's identity read the database
```

`db-bootstrap-mi.sh` is not optional. A freshly created database has no users at all, so
without it the API authenticates successfully and then finds it has access to nothing.

All three connect from your workstation, and the server's only firewall rule admits
Azure-hosted callers. Open your own address first, and close it afterwards — the rule is
a tool, not part of the environment:

```bash
MY_IP="$(curl -s https://api.ipify.org)"
az sql server firewall-rule create -g rg-lehub-dev -s sql-lehub-dev \
  -n "operator-$USER" --start-ip-address "$MY_IP" --end-ip-address "$MY_IP"

# ... run the three scripts ...

az sql server firewall-rule delete -g rg-lehub-dev -s sql-lehub-dev -n "operator-$USER"
```

Without it every one of them fails with *Cannot open server ... Client with IP address
... is not allowed to access the server*, which reads like a credentials problem and is
not one.

**The database tooling only knows `dev`.** `infra-deploy.sh` takes `prod`, but
`db-migrate.sh`, `db-seed.sh` and `db-bootstrap-mi.sh` do not, and `sql_configure` in
`scripts/lib/common.sh` hard-codes the dev server name. Deploying prod therefore leaves a
database with no schema and no identity user, and no scripted way to fix it. Teaching
those scripts about prod is a deliberate, reviewable change — the same stance
`db-seed.sh` already takes about where demo data is allowed to land — and it belongs with
the work that actually puts LeHub into production.

Two things are slow rather than broken, and both resolve on their own:

- **Azure RBAC takes a few minutes to propagate.** A Function App started immediately
  after the first deployment can fail to reach its storage, then recover.
- **The dev database auto-pauses.** The first connection after an hour of inactivity
  waits up to about a minute, or fails outright. Retry rather than conclude.

## Resetting an environment

> **This destroys data.** It drops the database and the deployed API and rebuilds them
> from the template. Only ever run it against `dev`.

An incremental deployment adds and updates, but never removes: anything an environment
picked up outside the template stays until something deletes it. When you want an
environment to match exactly what `/infra` describes — no leftover schema, no leftover
code — take it down and let the template build it back.

```bash
RG=rg-lehub-dev ; STG="$(az deployment group show -g $RG -n <deployment> \
  --query properties.outputs.storageAccountName.value -o tsv)"
SUB="$(az account show --query id -o tsv)"
ME="$(az ad signed-in-user show --query id -o tsv)"

# 1. The API and the database, as resources.
az functionapp delete -g $RG -n func-lehub-dev
az sql db delete -g $RG -s sql-lehub-dev -n lehub --yes

# 2. The host storage keeps the deployment package, the host keys and the function
#    metadata, and outlives the app. Shared keys are refused and being Owner on the
#    subscription grants nothing on the data, so take a data role for the duration.
az role assignment create --assignee "$ME" --role "Storage Blob Data Contributor" \
  --scope "/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.Storage/storageAccounts/$STG"

# Empty the containers rather than deleting them: a container name stays locked for a
# while after deletion, which would make the template fail to recreate `deployments`.
for c in deployments azure-webjobs-hosts azure-webjobs-secrets; do
  az storage blob delete-batch --account-name "$STG" --auth-mode login -s "$c"
done

az role assignment delete --assignee "$ME" --role "Storage Blob Data Contributor" \
  --scope "/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.Storage/storageAccounts/$STG"

# 3. Rebuild, then fill the database — see "After a first deployment" above.
./scripts/infra-deploy.sh dev
```

Recreating a serverless database takes a few minutes, and the connection that follows may
be waiting for it to wake. The Function App keeps its hostname, because the hostname
follows the resource name — so the CORS allow-list and any build-time API URL stay valid.

**The media account is deliberately not part of this.** It is the one store here whose
contents a redeployment cannot rebuild, and `storageAccountName` in the snippet above
resolves to the host storage, never to it. Emptying it would delete logos a community
handed over; the 7-day retention would give you a week to notice, and nothing after that.

## What is deliberately absent

| Not here | Why |
|---|---|
| Azure Key Vault | nothing in this scope is a secret, so there is nothing to store |
| `linkedBackends` | one Function App cannot be linked to two Static Web Apps |
| Static Web Apps Standard | its only advantage is the linked backend, at ~16 €/month |
| System-assigned identities | one explicit user-assigned identity, with its own lifetime |
| Private endpoints | out of budget; Entra authentication is the barrier instead |
| `FUNCTIONS_WORKER_RUNTIME` | Flex Consumption declares the runtime in `functionAppConfig` |
| Azure Verified Modules | the stories pin properties to the line; hand-written modules stay auditable |
| Any CDN in front of the media account | classic Azure CDN is retired, and Front Door Standard bills a 30.75 €/month base fee in westeurope before serving a byte — more, on its own, than the whole 25 € cap. The public blob endpoint with long cache headers is enough at this scale |
| Microsoft Defender for Cloud plans | see "Accepted risks" — together they cost more than the whole budget |
| Basic publishing credentials (SCM, FTP) | refused outright; deployment goes through the managed identity |

The identity holds three role assignments and no more: **Storage Blob Data Owner** on the
host storage account, **Storage Blob Data Contributor** on the media storage account, and
**Monitoring Metrics Publisher** on the Application Insights component. Blob Data Owner is
wider than anyone would pick — Flex Consumption manages the host content store as well as
reading the deployment package, and Blob Data Contributor does not cover it. It is a
constraint accepted knowingly, not an oversight, and it is why the media account gets the
narrower role: nothing manages a content store there.

Access to SQL is not an Azure RBAC assignment at all: it is a database user, created by
`scripts/db-bootstrap-mi.sh`.

## The deployment identity

GitHub Actions authenticates to Azure with OIDC federated credentials: the workflow
exchanges its GitHub-issued token for an Entra token at run time, so no Azure credential
of any kind is stored in GitHub — no secret, no certificate, no publish profile. The
identity is created once, by hand: the pipeline cannot create the identity it
authenticates with.

Every command below is replayable — each one either creates its object or fails loudly
because it already exists, and none of them generates a secret.

```bash
SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"

# 1. The Entra application and its service principal. No password, no certificate:
#    the federated credential below is the only way to authenticate as this identity.
APP_ID="$(az ad app create --display-name github-lehub-cicd --query appId -o tsv)"
SP_ID="$(az ad sp create --id "$APP_ID" --query id -o tsv)"

# 2. One federated credential per environment, never one per branch or pull request:
#    access to Azure always goes through a GitHub environment. The subject must be
#    exactly what GitHub puts in the token: since 15 July 2026 that is the *immutable*
#    format `repo:<org>@<org_id>/<repo>@<repo_id>:environment:<env>` for every
#    repository created, renamed or transferred after that date — this one included.
#    Never type the IDs by hand: read the prefix GitHub itself emits, and append the
#    environment. A wrong subject only shows up at run time as AADSTS700213, whose
#    message quotes the subject GitHub presented — copy it from there if in doubt.
SUB_PREFIX="$(gh api repos/lehub-ms/lehub/actions/oidc/customization/sub --jq .sub_claim_prefix)"
az ad app federated-credential create --id "$APP_ID" --parameters "{
  \"name\": \"github-env-dev\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"${SUB_PREFIX}:environment:dev\",
  \"audiences\": [\"api://AzureADTokenExchange\"],
  \"description\": \"GitHub Actions deployments to the dev environment\"
}"

# 3. Two role assignments, both scoped to the environment's resource group and nothing
#    wider: Contributor to create the resources, and Role Based Access Control
#    Administrator because main.bicep declares role assignments. Without the second,
#    a deployment creates the resources and then dies on the role-assignment module
#    with AuthorizationFailed, leaving a half-provisioned environment.
SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/rg-lehub-dev"
az role assignment create --assignee-object-id "$SP_ID" \
  --assignee-principal-type ServicePrincipal --role Contributor --scope "$SCOPE"
az role assignment create --assignee-object-id "$SP_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Role Based Access Control Administrator" --scope "$SCOPE"

# 4. Database access: membership of sg-lehub-sql-admins, the group that is the SQL
#    server's Entra administrator. This is the pipeline's only path into the database —
#    there is no SQL login to hand it.
az ad group member add --group sg-lehub-sql-admins --member-id "$SP_ID"

# 5. The GitHub environment the federated credential's subject points at, restricted
#    to the branch that deploys there. A workflow on any other branch fails the token
#    exchange before it ever reaches Azure.
gh api -X PUT repos/lehub-ms/lehub/environments/dev \
  -F "deployment_branch_policy[protected_branches]=false" \
  -F "deployment_branch_policy[custom_branch_policies]=true"
gh api -X POST repos/lehub-ms/lehub/environments/dev/deployment-branch-policies \
  -f name=develop

# 6. Three identifiers — not secrets — as environment variables. No GitHub secret
#    exists in this repository, and none should ever be added for Azure access.
gh variable set AZURE_CLIENT_ID       --env dev --body "$APP_ID"
gh variable set AZURE_TENANT_ID       --env dev --body "$TENANT_ID"
gh variable set AZURE_SUBSCRIPTION_ID --env dev --body "$SUBSCRIPTION_ID"
```

Opening prod one day repeats steps 2 to 6 with prod values — a second federated
credential and a second GitHub environment on the same application, scoped to
`rg-lehub-prod`.

Three things to know before trusting a first run:

- **RBAC propagation takes a few minutes.** The first deployment after creating the
  assignments can fail once and succeed on replay.
- **Renaming the repository or the organisation changes the subject.** The
  federated credential's subject embeds both names next to their immutable IDs; after a
  rename the token exchange fails with AADSTS700213 until the credential is recreated
  from the new `sub_claim_prefix` — nothing on the GitHub side explains why.
- **Verify the result, not the commands.** `az role assignment list --assignee "$APP_ID"
  --all` must return exactly two assignments, both scoped to the resource group, and
  `az ad app credential list --id "$APP_ID"` must return an empty list.

## Branch protection

GitHub refuses any merge whose CI is not green — the rule does not depend on the
discipline of whoever clicks the button. Two repository rulesets, `protect-main` and
`protect-develop`, enforce on both branches: pull request required, squash merge only,
force-push and deletion forbidden, linear history, the four `ci.yml` checks required, and
the branch up to date with its target before merging. `main` has no bypass actor — a
hotfix goes through a pull request like everything else, urgency included.

This configuration lives in GitHub, not in the repository, so it cannot be versioned —
and it can drift from this page without anything signalling it. Two mitigations:

- `docs/github/protect-main.json` and `docs/github/protect-develop.json` are the exported
  rulesets, replayable as-is on a fresh repository:

  ```bash
  gh api -X POST repos/lehub-ms/lehub/rulesets --input docs/github/protect-main.json
  gh api -X POST repos/lehub-ms/lehub/rulesets --input docs/github/protect-develop.json
  ```

- **The required-check list is maintained by hand.** Adding a job to `ci.yml` does not
  add it to the required checks — the omission is silent, and a pull request could merge
  without the new job being green. Renaming a job breaks the match the other way and
  blocks every pull request until the rulesets are updated. Any change to `ci.yml` job
  names updates the rulesets and re-exports the JSON in the same pull request.

The required checks are exactly the four jobs of `ci.yml`, no more: a required check
that never runs would block pull requests forever, which is why no `ci.yml` job is ever
conditional. A run cancelled by `concurrency` leaves a `cancelled` check, which is not a
failure and does not block.

## Continuous deployment

What the pipeline does, so nobody has to read the workflows to know the state of an
environment. Any change to a trigger or to the job order updates this section in the
same pull request — a page that drifts from the workflows is worse than no page.

### Triggers

| Event | Effect |
|---|---|
| Pull request to `develop` or `main` | `ci.yml` — build and test everything, no Azure access |
| Merge to `develop` | `cd-dev.yml` — full ordered deployment to dev |
| Merge to `main` | **nothing**, until putting LeHub into production is decided |
| `workflow_dispatch` on `cd-dev.yml` | same as a merge to `develop` — this is how a deployment is replayed |

The pipeline itself lives in `cd.yml`, reusable and parameterised by environment;
`cd-dev.yml` only decides when it runs. Opening prod one day is a thin new caller on
`main`, the prod half of the identity bootstrap above, and teaching the `/scripts`
database tooling about prod — not a rewrite.

Deployments serialise (`concurrency: cd-dev`, never cancelled mid-flight), so two close
merges produce two complete deployments, in order.

### Jobs, in order, and what each guarantees

1. **ci** — replays `ci.yml` on the merged commit: what was validated on the pull
   request is not what the merge produced. Nothing deploys if it fails.
2. **infra** — applies `infra/main.bicep` to the pre-existing resource group, as
   deployment `lehub-<run_id>` so the portal links back to the GitHub run. Every
   downstream job consumes resource names from its outputs; no name is hard-coded in a
   workflow.
3. **database** — opens a single-IP firewall rule `gh-<run_id>` (removed even on
   failure), waits for the serverless database to wake, then calls
   `scripts/db-migrate.sh` and `scripts/db-seed.sh` (never `--demo`). A failure stops
   the chain: the API never runs against a schema older than itself.
4. **api** — builds `/api`, publishes exactly `dist/`, `host.json`, `package.json` and
   production `node_modules` to the Function App, writes no app setting (Bicep owns
   them), then probes `GET /api/health` until it answers 200 — a published-but-dead API
   is a red job.
5. **web** — builds both front-ends with `VITE_API_BASE_URL` from the infra outputs
   (an empty value fails the build), reads each Static Web App's deployment token at
   run time from the OIDC session — masked, never stored — publishes both
   independently, and checks both hostnames answer 200.

### Common failures

| Symptom | Cause |
|---|---|
| `AADSTS700213: No matching federated identity record found for presented assertion subject '...'` | the federated credential's subject is not the one quoted in the message — compare it with `az ad app federated-credential list --id "$APP_ID"`. Typically a credential created in the legacy `repo:lehub-ms/lehub:environment:dev` format while GitHub now emits the immutable `repo:lehub-ms@<id>/lehub@<id>:environment:dev`, a renamed repository or organisation, or a run from a branch the `dev` environment does not allow |
| `AuthorizationFailed` on the role-assignment module | the identity lost `Role Based Access Control Administrator`, or RBAC propagation after the bootstrap has not settled yet — replay once before digging |
| First deployment after the bootstrap fails, second succeeds | RBAC propagation, a few minutes |
| `database` job times out on its wake-up step | the serverless database took longer than the bounded retries; replay the run |
| `checksum mismatch` from `db-migrate.sh` | a migration file was modified after being applied — restore the file, the fix is a *new* migration |
| Function App publication refused | Flex Consumption writes to the `deployments` blob container; the app's managed identity needs its Storage Blob Data Owner assignment, which the infra job creates — a half-deleted environment loses it |
| A `gh-*` firewall rule survives | the run was cancelled brutally between create and delete; delete it by name, nothing else uses that prefix |

### Replaying and rolling back

Replay: `Actions → CD dev → Run workflow` on `develop` (or `gh workflow run cd-dev.yml
--ref develop`). The pipeline is idempotent — an unchanged commit produces a no-change
deployment, "database is up to date", and a republished identical build.

Rollback: there is none. Going back means replaying the chain on an earlier commit —
revert the offending commit on `develop` through a pull request and let the merge
deploy. Migrations do not roll back either: write a new migration that undoes the
damage.

### What the chain does not do

- No production deployment, and no `prod` support in the database scripts — both belong
  to the feature that actually puts LeHub into production.
- No per-pull-request preview environments: the Static Web Apps Free plan does not
  offer them, a trade-off accepted with the plan.
- No automatic rollback, no end-to-end tests, no schema lifecycle beyond calling the
  `/scripts` entry points.

The Static Web Apps are wired to their content by this pipeline alone — the Bicep
template leaves `repositoryUrl` unset on purpose, and a Static Web App recreated by hand
serves the default page until the next merge republishes it.

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
| No blob soft delete or versioning | the container holds the deployment package, which a redeployment rebuilds |
| Point-in-time restore only, 7 days on prod Basic | long-term retention is billed per GB and the data is re-seedable |
| No regional DR, no zone redundancy | a community agenda tolerates hours of downtime; geo-redundancy does not fit the budget |
| Storage reachable from any network | `allowSharedKeyAccess: false` means Entra is the barrier, not the network |
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

```bash
./scripts/infra-deploy.sh dev --what-if     # preview, changes nothing
./scripts/infra-deploy.sh dev               # apply
./scripts/infra-deploy.sh prod --what-if    # validate the production parameters
```

Applying to prod types the resource group name back before anything happens.

A second `--what-if` straight after a deployment reports **nine resources to modify**, and
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
| Microsoft Defender for Cloud plans | see "Accepted risks" — together they cost more than the whole budget |
| Basic publishing credentials (SCM, FTP) | refused outright; deployment goes through the managed identity |

The identity holds two role assignments and no more: **Storage Blob Data Owner** on the
storage account, and **Monitoring Metrics Publisher** on the Application Insights
component. Blob Data Owner is wider than anyone would pick — Flex Consumption manages
the host content store as well as reading the deployment package, and Blob Data
Contributor does not cover it. It is a constraint accepted knowingly, not an oversight.

Access to SQL is not an Azure RBAC assignment at all: it is a database user, created by
`scripts/db-bootstrap-mi.sh`.

## Continuous deployment

There is none yet. Deployments are run by hand with `infra-deploy.sh` until the
continuous deployment feature lands, which is also what will wire each Static Web App to
this repository — the template leaves `repositoryUrl` unset on purpose.

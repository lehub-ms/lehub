using './main.bicep'

// Development environment — rg-lehub-dev.
//
// Estimated cost, westeurope retail prices in EUR:
//
//   Azure SQL GP_S_Gen5_1   0.5043 €/vCore-hour, billed from minCapacity 0.5
//                           => ~0.25 €/hour while the database is awake.
//                           Auto-pause after 60 idle minutes means a day without
//                           activity costs compute nothing at all.
//   Azure SQL storage       0.1202 €/GB/month (General Purpose data stored)
//   Function App FC1        pay-per-execution, alwaysReady 0 => idles at zero
//   Static Web Apps         Free tier, 0 €
//   Media storage           Hot LRS: 0.0172 €/GB/month stored, 0.0038 €/10K reads.
//                           A few hundred logos and a community agenda's traffic
//                           land under 0.10 €/month; egress stays inside the free
//                           monthly allowance.
//   Storage, Log Analytics  a few cents at this volume
//
// Realistically 5-10 €/month for a database woken a few hours on the days someone
// is actually working on LeHub. The auto-pause is what keeps it there.

param environmentName = 'dev'

param sqlDatabaseSku = 'GP_S_Gen5_1'

// Entra group sg-lehub-sql-admins. A directory object ID is an identifier, not a
// credential: it grants nothing on its own, so committing it is not a secret leak.
param sqlAadAdminGroupObjectId = '55cd4180-4ca7-414e-a3ca-d12948084404'

// Object ID of the service principal github-lehub-cicd, which the deployment chain
// authenticates as. The same one in both environments: one Entra application, one
// service principal, one federated credential per GitHub environment. Like the group
// above, a directory object ID is an identifier and not a credential.
param deploymentPrincipalObjectId = '6e283300-b1a3-4d93-a41d-37fcca46a7d0'

// The dev Entra External ID tenant, lehubextiddev.onmicrosoft.com, and the LeHub
// application registration inside it. Neither is a credential: the tenant ID is published
// by the tenant's own anonymous OpenID configuration, and the client ID of a public client
// is sent in the query string of every sign-in — it identifies the application, it does not
// authenticate it.
//
// This file is the one place either value is written for this environment. The API and the
// two applications receive them from the deployment; the local scripts read them straight
// from here. `scripts/entra-bootstrap.sh dev` prints them, and tells you on its next run if
// the tenant no longer serves what is written here.
param entraTenantId = 'f5850776-0bc8-402e-85e9-1d8713d64ddb'
param entraClientId = '0ba42dc6-26d6-448c-b235-8ef540730c7e'

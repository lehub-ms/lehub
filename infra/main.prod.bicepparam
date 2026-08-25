using './main.bicep'

// Production environment — rg-lehub-prod.
//
// Estimated cost, westeurope retail prices in EUR:
//
//   Azure SQL Basic         0.1415 €/day => ~4.30 €/month, flat.
//                           5 DTU, 2 GB included, always on: no auto-pause, so no
//                           wake-up latency on a visitor's first request.
//   Function App FC1        pay-per-execution, plus one alwaysReady instance
//   Static Web Apps         Free tier, 0 €
//   Media storage           Hot LRS: 0.0172 €/GB/month stored, 0.0038 €/10K reads.
//                           Under 0.10 €/month at this volume. No CDN in front of
//                           it: Front Door Standard alone is 30.75 €/month.
//   Storage, Log Analytics  a few euros at expected volume
//
// Comfortably inside the ~25 €/month cap the project sets itself.

param environmentName = 'prod'

param sqlDatabaseSku = 'Basic'

param sqlAadAdminGroupObjectId = '55cd4180-4ca7-414e-a3ca-d12948084404'

// Object ID of the service principal github-lehub-cicd, which the deployment chain
// authenticates as. The same one in both environments: one Entra application, one
// service principal, one federated credential per GitHub environment. Like the group
// above, a directory object ID is an identifier and not a credential.
param deploymentPrincipalObjectId = '6e283300-b1a3-4d93-a41d-37fcca46a7d0'

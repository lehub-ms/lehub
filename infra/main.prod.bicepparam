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
//   Storage, Log Analytics  a few euros at expected volume
//
// Comfortably inside the ~25 €/month cap the project sets itself.

param environmentName = 'prod'

param sqlDatabaseSku = 'Basic'

param sqlAadAdminGroupObjectId = '55cd4180-4ca7-414e-a3ca-d12948084404'

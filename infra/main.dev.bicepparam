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
//   Storage, Log Analytics  a few cents at this volume
//
// Realistically 5-10 €/month for a database woken a few hours on the days someone
// is actually working on LeHub. The auto-pause is what keeps it there.

param environmentName = 'dev'

param sqlDatabaseSku = 'GP_S_Gen5_1'

// Entra group sg-lehub-sql-admins. A directory object ID is an identifier, not a
// credential: it grants nothing on its own, so committing it is not a secret leak.
param sqlAadAdminGroupObjectId = '55cd4180-4ca7-414e-a3ca-d12948084404'

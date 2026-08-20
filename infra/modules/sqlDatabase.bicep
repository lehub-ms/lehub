// The lehub database. One per environment, always under that name.
//
// The local Docker database is called lehub-local and has nothing to do with this.
// Schema and data are applied by scripts/db-migrate.sh and scripts/db-seed.sh, not here.

param serverName string
param databaseName string
param location string
param tags object

@allowed([
  'GP_S_Gen5_1'
  'Basic'
])
param skuName string

resource server 'Microsoft.Sql/servers@2023-08-01-preview' existing = {
  name: serverName
}

// Whether the SKU is serverless is decided here rather than in the bicepparam:
// autoPauseDelay and minCapacity are rejected outright on a provisioned SKU, so the
// condition has to live with the resource that carries them.
var isServerless = startsWith(skuName, 'GP_S_')

resource database 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: server
  name: databaseName
  location: location
  tags: tags
  sku: isServerless
    ? {
        name: 'GP_S_Gen5'
        tier: 'GeneralPurpose'
        family: 'Gen5'
        capacity: 1
      }
    : {
        name: 'Basic'
        tier: 'Basic'
        capacity: 5
      }
  properties: {
    zoneRedundant: false
    requestedBackupStorageRedundancy: 'Local'
    // Pauses after an hour of inactivity and stops billing compute. The price is that
    // the first connection after a pause can take up to a minute, or fail outright —
    // every consumer has to retry rather than give up on the first attempt.
    autoPauseDelay: isServerless ? 60 : null
    // Bicep has no decimal literal, so 0.5 has to go through json().
    minCapacity: isServerless ? json('0.5') : null
  }
}

output name string = database.name

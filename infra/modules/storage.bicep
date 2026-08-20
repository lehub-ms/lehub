// The Function App's host storage: content share and deployment package container.
//
// Standard_LRS, no geo-redundancy: this holds nothing that cannot be rebuilt by
// redeploying, and geo-redundancy does not fit the budget.

param name string
param location string
param tags object

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: name
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    // The setting the whole no-secret posture rests on: with shared keys refused,
    // the only way in is the user-assigned managed identity. If the Functions host
    // ever turns out to still need a key, that is to be discovered here and written
    // down as a decision — not worked around by quietly flipping this back.
    allowSharedKeyAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  // Declared rather than left out. This resource exists to parent the container below,
  // but a deployment rewrites what it names and erases what it does not: leaving the
  // properties off silently removed the retention policies on every run. Off is the
  // decision — the container holds the deployment package and nothing else, and a
  // redeployment rebuilds it — so turning soft delete on means changing these lines,
  // not discovering later that the template quietly turned it back off.
  properties: {
    deleteRetentionPolicy: {
      enabled: false
    }
    containerDeleteRetentionPolicy: {
      enabled: false
    }
  }
}

// Flex Consumption pulls the code package from this container.
resource deployments 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'deployments'
  properties: {
    publicAccess: 'None'
  }
}

output name string = storage.name

// Built from the account name rather than from storage.properties.primaryEndpoints.blob.
// The latter compiles to reference(), which what-if cannot evaluate, so every preview
// would report the Function App's deployment URI as changing when it is not.
@description('Exactly the form functionAppConfig.deployment.storage.value expects.')
output deploymentContainerUri string = 'https://${name}.blob.${environment().suffixes.storage}/${deployments.name}'

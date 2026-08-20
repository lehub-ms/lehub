// Every Azure RBAC assignment LeHub needs, and nothing more.
//
// Two, both on the user-assigned managed identity, each scoped to the one resource it
// concerns. Nothing is granted at resource group or subscription scope.
//
// The identity's access to Azure SQL is not here and is not an RBAC assignment: it is a
// database user created by db/bootstrap/create-mi-user.sql.

@description('principalId of the user-assigned managed identity.')
param principalId string

param storageAccountName string
param appInsightsName string

// Referenced as existing so each assignment can be scoped to the resource itself while
// both stay in this one file.
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: appInsightsName
}

var storageBlobDataOwnerRoleId = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
var monitoringMetricsPublisherRoleId = '3913510d-42f4-4e42-8a64-420c390055eb'

resource storageBlobDataOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  // Deterministic, so redeploying updates the same assignment instead of colliding.
  name: guid(storage.id, principalId, storageBlobDataOwnerRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageBlobDataOwnerRoleId
    )
    principalId: principalId
    principalType: 'ServicePrincipal'
    // Wider than anyone would choose. Storage Blob Data Contributor does not satisfy
    // Flex Consumption, which manages the host content store as well as reading the
    // deployment package, so this is a constraint accepted rather than a preference.
    description: 'Flex Consumption needs to manage the host content store and read the deployments container. Storage Blob Data Contributor is not sufficient.'
  }
}

resource monitoringMetricsPublisher 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: appInsights
  name: guid(appInsights.id, principalId, monitoringMetricsPublisherRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      monitoringMetricsPublisherRoleId
    )
    principalId: principalId
    principalType: 'ServicePrincipal'
    // Replaces the instrumentation key that disableLocalAuth switched off.
    description: 'Publishes telemetry to Application Insights, which accepts Entra-authenticated ingestion only.'
  }
}

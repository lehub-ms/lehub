// The single identity every LeHub component authenticates as.
//
// One user-assigned identity per environment, shared by the Function App, the SQL
// database user and the telemetry pipeline. User-assigned rather than system-assigned
// on purpose: its lifetime is independent of the Function App, so recreating the app
// does not invalidate the role assignments or the SQL user that reference it.

@description('Name of the identity, id-lehub-<env>.')
param name string

param location string
param tags object

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: name
  location: location
  tags: tags
}

@description('Used by every Azure RBAC role assignment.')
output principalId string = identity.properties.principalId

@description('Used by app settings and by the SQL connection.')
output clientId string = identity.properties.clientId

@description('Full resource ID, as required by the Function App identity block.')
output id string = identity.id

output name string = identity.name

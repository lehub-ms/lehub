// The logical SQL server, Microsoft Entra authentication only.
//
// No administratorLogin and no administratorLoginPassword are declared anywhere: the
// server is created Entra-only in a single step, so there is never a window in which a
// transitional SQL administrator exists.

param name string
param location string
param tags object

@description('Object ID of the sg-lehub-sql-admins Entra group.')
param aadAdminGroupObjectId string

resource server 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: name
  location: location
  tags: tags
  properties: {
    minimalTlsVersion: '1.2'
    // A private endpoint is out of budget. Entra authentication is the real barrier,
    // not the network boundary — a reachable endpoint no one can authenticate against
    // is the trade this project accepts.
    publicNetworkAccess: 'Enabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      principalType: 'Group'
      // A group, never a person: the server outlives whoever set it up.
      login: 'sg-lehub-sql-admins'
      sid: aadAdminGroupObjectId
      tenantId: subscription().tenantId
      // An invariant, not a setting. It is never parameterised and never turned off.
      azureADOnlyAuthentication: true
    }
  }
}

// Lets Azure-hosted workloads through, the Function App among them. This admits every
// Azure IP, including ones outside this subscription — acceptable only because Entra
// authentication is what actually guards the data.
resource allowAzureServices 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: server
  name: 'AllowAllWindowsAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

output name string = server.name
output fullyQualifiedDomainName string = server.properties.fullyQualifiedDomainName

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

@description('Log Analytics workspace the security audit is written to.')
param logAnalyticsWorkspaceId string

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

// Who authenticated, and who failed to. Until this existed the project logged nothing at
// all on its database, while claiming security-relevant events were logged.
//
// Microsoft Defender for SQL is the richer answer and costs around 13 EUR a month, which
// does not fit the budget. An audit stream costs only what it ingests.
resource audit 'Microsoft.Sql/servers/auditingSettings@2023-08-01-preview' = {
  parent: server
  name: 'default'
  properties: {
    state: 'Enabled'
    isAzureMonitorTargetEnabled: true
    // Spelled out because the default is not nothing: an empty list falls back to three
    // groups, BATCH_COMPLETED_GROUP among them, which records every statement the API
    // ever runs. That is an ingestion bill, not a security log.
    auditActionsAndGroups: [
      'FAILED_DATABASE_AUTHENTICATION_GROUP'
      'SUCCESSFUL_DATABASE_AUTHENTICATION_GROUP'
    ]
  }
}

// The half of server-level auditing that is easy to leave out. isAzureMonitorTargetEnabled
// only declares an intent; nothing is written anywhere until a diagnostic setting on the
// master database names the destination. Without this the audit is enabled, healthy in
// every portal blade, and produces no rows.
resource masterDatabase 'Microsoft.Sql/servers/databases@2023-08-01-preview' existing = {
  parent: server
  name: 'master'
}

resource auditToWorkspace 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: masterDatabase
  name: 'sqlAudit'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        category: 'SQLSecurityAuditEvents'
        enabled: true
      }
    ]
  }
}

output name string = server.name
output fullyQualifiedDomainName string = server.properties.fullyQualifiedDomainName

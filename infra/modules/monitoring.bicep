// Telemetry, from the first deployment onward.
//
// Two inseparable resources: a Log Analytics workspace and a workspace-based
// Application Insights component. The workspace is declared first and referenced by
// the component — declaring them the other way round yields a classic Application
// Insights, which is deprecated.

param logAnalyticsName string
param appInsightsName string
param location string
param tags object

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    // The included tier. Raising it is billed, and is a budget decision of its own.
    retentionInDays: 30
  }
}

resource component 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    // Ingestion accepts Microsoft Entra tokens only. This is what demotes the
    // connection string from secret to plain identifier: on its own it can no longer
    // publish anything, so it can sit in an app setting in the clear.
    //
    // Consequence to remember: browser-side telemetry is off the table while this is
    // set, because the JavaScript SDK cannot authenticate against Entra.
    DisableLocalAuth: true
  }
}

output connectionString string = component.properties.ConnectionString

@description('Scope of the Monitoring Metrics Publisher role assignment.')
output componentName string = component.name

output workspaceId string = workspace.id

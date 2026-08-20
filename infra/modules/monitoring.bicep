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
    workspaceCapping: {
      // A runaway guard, not a target: real volume here is a few megabytes a day.
      // Sustaining 0.5 GB/day would cost more than the environment's whole budget,
      // which is exactly the accident this is meant to stop.
      //
      // The cost of the guard: once the cap is reached, ingestion stops until
      // midnight UTC — including the SQL security audit. Protecting the bill can
      // therefore leave a hole in the security log. That trade is written down in
      // docs/deployment.md rather than left to be discovered.
      dailyQuotaGb: json('0.5')
    }
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

// The Function App tags itself with this id so the portal keeps linking the app to its
// component. Without it the platform's own hidden-link tag is erased on every deployment.
output componentId string = component.id

output workspaceId string = workspace.id

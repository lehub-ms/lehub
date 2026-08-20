// LeHub — every Azure resource of one environment, in one deployment.
//
//   az deployment group what-if -g rg-lehub-dev \
//     --template-file infra/main.bicep --parameters infra/main.dev.bicepparam
//
// Resource groups are created by hand and are never described here: the scope is the
// group, so a template that could create it would have to run at subscription scope
// and would need rights this project deliberately does not grant.
//
// This file declares no resource of its own. It owns the names, the tags and the
// parameters, and composes the modules under ./modules.

targetScope = 'resourceGroup'

// ─── Parameters ──────────────────────────────────────────────────────────────
// Three, and only three. Everything else is either derived from the environment
// name or fixed by a module — a value that cannot differ between environments has
// no business being a parameter.

@description('Environment this deployment targets. Drives every name and every SKU.')
@allowed([
  'dev'
  'prod'
])
param environmentName string

@description('Azure SQL database SKU. Serverless in dev, provisioned in prod.')
@allowed([
  'GP_S_Gen5_1'
  'Basic'
])
param sqlDatabaseSku string

@description('Object ID of the sg-lehub-sql-admins Entra group, the SQL server administrator.')
// Length-constrained so a missing or empty value fails validation before the first
// resource is created, rather than half-way through the deployment.
@minLength(36)
@maxLength(36)
param sqlAadAdminGroupObjectId string

// ─── Naming and tags ─────────────────────────────────────────────────────────
// Computed once here and passed down; no module rebuilds them.

// Never a parameter: westeurope is the only authorised region, and the group already
// carries it. A group created elsewhere would silently move the whole environment, which
// the template cannot express — so scripts/infra-deploy.sh refuses to deploy into a group
// outside westeurope before this line is ever evaluated.
var location = resourceGroup().location

var tags = {
  env: environmentName
  project: 'lehub'
}

// Deterministic for a given resource group, so redeploying resolves to the same names.
var uniqueSuffix = uniqueString(resourceGroup().id)

var managedIdentityName = 'id-lehub-${environmentName}'
var logAnalyticsName = 'log-lehub-${environmentName}'
var appInsightsName = 'appi-lehub-${environmentName}'
var storageAccountName = 'stlehub${environmentName}${substring(uniqueSuffix, 0, 6)}'
var appServicePlanName = 'asp-lehub-${environmentName}-func'
var sqlServerName = 'sql-lehub-${environmentName}'
var sqlDatabaseName = 'lehub'
var webStaticSiteName = 'swa-lehub-${environmentName}'
var adminStaticSiteName = 'swa-admin-lehub-${environmentName}'
var functionAppName = 'func-lehub-${environmentName}'

// Derived rather than parameterised, to hold the three-parameter rule: dev scales to
// zero, prod keeps one instance warm so the first visitor does not pay for a cold start.
var alwaysReadyInstances = environmentName == 'prod' ? 1 : 0

// Same rule, the other end of the range: how far the API is allowed to scale out. Kept
// deliberately low — this is a bill ceiling before it is a capacity one, and 20 instances
// of 512 MB are far more than a community agenda ever needs.
var maximumInstances = environmentName == 'prod' ? 20 : 10

// Tripwires, not targets. Dev is estimated at 5-10 EUR a month and is the volatile one,
// since a woken serverless database bills by the hour; prod is a flat 4.30 EUR plus usage.
// Prod is set high enough that an alert is unambiguous, and its 50% threshold lands
// exactly on the ~25 EUR the project budgets for itself as a whole.
var monthlyBudgetAmount = environmentName == 'prod' ? 50 : 15

// The local Vite origins exist only so the development loop exercises the same
// cross-origin path as the cloud. They have no reason to be allowed in prod.
var localDevOrigins = environmentName == 'dev'
  ? [
      'http://localhost:5173'
      'http://localhost:5174'
    ]
  : []

// ─── Composition ─────────────────────────────────────────────────────────────
// Order is expressed by the values modules pass to each other. The one exception is
// spelled out on the Function App below: a dependency that carries no value cannot be
// expressed any other way.

module managedIdentity 'modules/managedIdentity.bicep' = {
  name: 'managedIdentity'
  params: {
    name: managedIdentityName
    location: location
    tags: tags
  }
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    logAnalyticsName: logAnalyticsName
    appInsightsName: appInsightsName
    location: location
    tags: tags
  }
}

// Deliberately first, and dependent on nothing: a guard that is only provisioned once the
// resources it guards succeeded would be missing exactly when a deployment goes wrong.
module budget 'modules/budget.bicep' = {
  name: 'budget'
  params: {
    environmentName: environmentName
    monthlyBudgetAmount: monthlyBudgetAmount
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    name: storageAccountName
    location: location
    tags: tags
  }
}

module appServicePlan 'modules/appServicePlan.bicep' = {
  name: 'appServicePlan'
  params: {
    name: appServicePlanName
    location: location
    tags: tags
  }
}

module sqlServer 'modules/sqlServer.bicep' = {
  name: 'sqlServer'
  params: {
    name: sqlServerName
    location: location
    tags: tags
    aadAdminGroupObjectId: sqlAadAdminGroupObjectId
    // Carries the ordering too: the workspace has to exist before the audit can name it.
    logAnalyticsWorkspaceId: monitoring.outputs.workspaceId
  }
}

module sqlDatabase 'modules/sqlDatabase.bicep' = {
  name: 'sqlDatabase'
  params: {
    serverName: sqlServer.outputs.name
    databaseName: sqlDatabaseName
    location: location
    tags: tags
    skuName: sqlDatabaseSku
  }
}

module webStaticSite 'modules/staticWebApp.bicep' = {
  name: 'webStaticSite'
  params: {
    name: webStaticSiteName
    location: location
    tags: tags
  }
}

module adminStaticSite 'modules/staticWebApp.bicep' = {
  name: 'adminStaticSite'
  params: {
    name: adminStaticSiteName
    location: location
    tags: tags
  }
}

// Built here rather than in the module: main.bicep is the only place that knows both
// front-ends and the environment. A custom domain added later becomes a new origin and
// has to be added here, or the site fails CORS while the API looks perfectly healthy.
var allowedOrigins = concat(
  [
    'https://${webStaticSite.outputs.defaultHostname}'
    'https://${adminStaticSite.outputs.defaultHostname}'
  ],
  localDevOrigins
)

module roleAssignments 'modules/roleAssignments.bicep' = {
  name: 'roleAssignments'
  params: {
    principalId: managedIdentity.outputs.principalId
    storageAccountName: storage.outputs.name
    appInsightsName: monitoring.outputs.componentName
  }
}

module functionApp 'modules/functionApp.bicep' = {
  name: 'functionApp'
  params: {
    name: functionAppName
    location: location
    tags: tags
    appServicePlanId: appServicePlan.outputs.id
    managedIdentityId: managedIdentity.outputs.id
    managedIdentityClientId: managedIdentity.outputs.clientId
    storageAccountName: storage.outputs.name
    deploymentContainerUri: storage.outputs.deploymentContainerUri
    sqlServerFqdn: sqlServer.outputs.fullyQualifiedDomainName
    sqlDatabaseName: sqlDatabase.outputs.name
    appInsightsConnectionString: monitoring.outputs.connectionString
    appInsightsId: monitoring.outputs.componentId
    allowedOrigins: allowedOrigins
    alwaysReadyInstances: alwaysReadyInstances
    maximumInstances: maximumInstances
  }
  // The only explicit dependency in this file, and the only one that cannot be implicit:
  // no value flows from the role assignments to the app. With shared-key access refused
  // on the storage account, the identity has no way to reach the deployment container
  // until Storage Blob Data Owner exists — so on a new resource group the host would
  // otherwise come up before it is allowed to read its own code.
  dependsOn: [
    roleAssignments
  ]
}

// ─── Outputs ─────────────────────────────────────────────────────────────────

output functionAppHostname string = functionApp.outputs.defaultHostname

// Carries the scheme on purpose. The bare hostname assigned to VITE_API_BASE_URL would
// be resolved as a relative path against the site's own origin, which fails as a 404
// from the static host rather than as anything recognisable as an API problem.
@description('Becomes VITE_API_BASE_URL when the front-ends are built.')
output apiBaseUrl string = 'https://${functionApp.outputs.defaultHostname}'

output webAppHostname string = webStaticSite.outputs.defaultHostname
output adminAppHostname string = adminStaticSite.outputs.defaultHostname

output sqlServerFqdn string = sqlServer.outputs.fullyQualifiedDomainName
output sqlDatabaseName string = sqlDatabase.outputs.name

@description('Consumed by scripts/db-bootstrap-mi.sh to create the database user.')
output managedIdentityName string = managedIdentity.outputs.name
output managedIdentityClientId string = managedIdentity.outputs.clientId
output managedIdentityPrincipalId string = managedIdentity.outputs.principalId

output storageAccountName string = storage.outputs.name

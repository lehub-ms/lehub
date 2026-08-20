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
// carries it. A group created elsewhere would silently move the environment, which is
// a review-time check, not something the template can express.
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
  }
}


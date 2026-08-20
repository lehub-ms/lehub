// The API. One Function App per environment, serving both front-ends cross-origin.
//
// Deployed last, because its CORS allow-list is built from the two Static Web App
// hostnames.

param name string
param location string
param tags object

param appServicePlanId string
param managedIdentityId string
param managedIdentityClientId string

param storageAccountName string
param deploymentContainerUri string

param sqlServerFqdn string
param sqlDatabaseName string

param appInsightsConnectionString string

@description('Exactly the origins allowed to call the API. Nothing else gets through.')
param allowedOrigins array

@description('Instances kept warm. 0 in dev, 1 in prod.')
param alwaysReadyInstances int

resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  name: name
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    // One explicit identity, no system-assigned one. Its lifetime stays independent of
    // this app, so recreating the app leaves the role assignments and the SQL user intact.
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
  properties: {
    serverFarmId: appServicePlanId
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: deploymentContainerUri
          authentication: {
            type: 'UserAssignedIdentity'
            userAssignedIdentityResourceId: managedIdentityId
          }
        }
      }
      runtime: {
        name: 'node'
        // Matches .nvmrc and the local development host.
        version: '22'
      }
      scaleAndConcurrency: {
        // An entry with a count of zero is not how the platform records "nothing kept
        // warm" — it records an empty list. Emitting the entry only when it is non-zero
        // keeps dev equal to what is actually deployed.
        alwaysReady: alwaysReadyInstances > 0
          ? [
              {
                name: 'http'
                instanceCount: alwaysReadyInstances
              }
            ]
          : []
        instanceMemoryMB: 512
        maximumInstanceCount: 40
      }
    }
    siteConfig: {
      cors: {
        allowedOrigins: allowedOrigins
        // No cookies, no credentialed requests: the API is anonymous in this scope.
        supportCredentials: false
      }
    }
  }
}

// Declared as a child resource rather than inline in siteConfig because this type
// replaces the whole set on every deployment: this block is the complete list of app
// settings, and anything absent from it is absent from the application.
//
// The flip side is the same property read the other way — whatever is not listed here is
// erased — so the deployment workflow must not add app settings of its own.
resource appSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: functionApp
  name: 'appsettings'
  properties: {
    // Host storage, reached with the managed identity — no connection string, no key.
    AzureWebJobsStorage__accountName: storageAccountName
    AzureWebJobsStorage__credential: 'managedidentity'
    AzureWebJobsStorage__clientId: managedIdentityClientId

    FUNCTIONS_EXTENSION_VERSION: '~4'
    // FUNCTIONS_WORKER_RUNTIME is deliberately absent: on Flex Consumption the runtime
    // is declared in functionAppConfig.runtime, and setting it here breaks start-up.

    SQL_SERVER: sqlServerFqdn
    SQL_DATABASE: sqlDatabaseName
    SQL_AUTH_MODE: 'mi'
    SQL_MI_CLIENT_ID: managedIdentityClientId

    // Safe in the clear: the component refuses local authentication, so the connection
    // string alone cannot publish anything. The authentication string is what actually
    // lets the host ingest, and it names an identity rather than carrying a key.
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString
    APPLICATIONINSIGHTS_AUTHENTICATION_STRING: 'ClientId=${managedIdentityClientId};Authorization=AAD'

    // Nothing about authentication: every request in this scope is anonymous.
  }
}

// Stated rather than left unsaid. Serving this API anonymously is a decision, and an
// omission cannot express a decision: a template that stays silent about platform
// authentication accepts whatever the app already has, because an incremental deployment
// never removes a setting it does not mention.
//
// The API validates its own tokens with jose when it has any to validate. Nothing is
// delegated to the platform's authentication layer.
resource authSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: functionApp
  name: 'authsettingsV2'
  properties: {
    platform: {
      enabled: false
    }
    globalValidation: {
      requireAuthentication: false
      unauthenticatedClientAction: 'AllowAnonymous'
    }
  }
}

output name string = functionApp.name
output defaultHostname string = functionApp.properties.defaultHostName

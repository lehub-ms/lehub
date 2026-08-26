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

@description('Absolute base of the media container. The API composes every media URL from it.')
param mediaBaseUrl string

param appInsightsConnectionString string

@description('Resource id of the Application Insights component, for the portal link tag.')
param appInsightsId string

@description('Exactly the origins allowed to call the API. Nothing else gets through.')
param allowedOrigins array

@description('Entra External ID tenant of this environment. Identifiers, not credentials.')
param entraTenantId string
param entraClientId string

@description('What the applications point at when they sign a user in.')
param entraAuthority string

@description('What the tokens the API validates are issued by. Not the same string as the authority.')
param entraIssuer string

@description('Instances kept warm. 0 in dev, 1 in prod.')
param alwaysReadyInstances int

@description('Hard ceiling on scale-out. 10 in dev, 20 in prod.')
param maximumInstances int

resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  name: name
  location: location
  // The platform adds a hidden-link tag pointing at the Application Insights component,
  // and that is what makes the portal show the component on this app's blade. Tags are
  // replaced wholesale on every deployment, so a bare `tags: tags` deleted it each time.
  // Declaring it here is the only way to both own the tag set and keep the link.
  tags: union(tags, {
    'hidden-link:${appInsightsId}': 'Resource'
  })
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
        // A ceiling on the bill before it is a ceiling on capacity. The API is anonymous
        // and reaches the database on every call, so anything that hammers it scales the
        // plan and keeps a serverless database awake. A budget alert arrives after the
        // money is spent; this refuses to spend it.
        maximumInstanceCount: maximumInstances
      }
    }
    siteConfig: {
      // Deployment reads the package from a blob container with the managed identity.
      // FTP is a second way in that nothing uses, so it is closed rather than secured.
      ftpsState: 'Disabled'
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

    // The API stores blob paths and composes absolute URLs from this. Not a secret: it is the
    // public read endpoint of the media container, and it is about to be printed in the CSP of
    // both front-ends anyway.
    MEDIA_BASE_URL: mediaBaseUrl

    // Safe in the clear: the component refuses local authentication, so the connection
    // string alone cannot publish anything. The authentication string is what actually
    // lets the host ingest, and it names an identity rather than carrying a key.
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString
    APPLICATIONINSIGHTS_AUTHENTICATION_STRING: 'ClientId=${managedIdentityClientId};Authorization=AAD'

    // What the API needs to validate a token for itself, with jose: the issuer to check,
    // the client ID to check the audience against, and the authority its JWKS hangs off.
    // None of them is a secret — all four appear in the tokens themselves, or in the
    // anonymous OpenID configuration anyone can fetch. They are settings rather than
    // constants because the two environments are two different tenants: that separation is
    // the whole reason a test account cannot open a session on production.
    ENTRA_TENANT_ID: entraTenantId
    ENTRA_CLIENT_ID: entraClientId
    ENTRA_AUTHORITY: entraAuthority
    ENTRA_ISSUER: entraIssuer
  }
}

// Stated rather than left unsaid. Serving this API anonymously is a decision, and an
// omission cannot express a decision: a template that stays silent about platform
// authentication accepts whatever the app already has, because an incremental deployment
// never removes a setting it does not mention.
//
// The API validates its own tokens with jose when it has any to validate. Nothing is
// delegated to the platform's authentication layer.
//
// Chained behind the app settings on purpose, and every site-level write below is chained
// in turn. Their only implicit dependency is the site itself, so ARM issues the requests
// concurrently — while App Service serialises writes to a site, and the losing request
// comes back `409 Cannot modify this site because another operation is in progress`.
// Intermittently, and only on a redeploy. This chain is what makes it impossible; do not
// collapse it back into siblings.
resource authSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: functionApp
  name: 'authsettingsV2'
  dependsOn: [
    appSettings
  ]
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

// The last static credential the platform still offered. Both default to allowed, which
// left a username-and-password path into Kudu and FTP: whoever obtained the publish
// profile could deploy code to this API without holding any Entra identity at all. That
// is the opposite of what the rest of this template spends its effort on.
//
// Deployment goes through the managed identity and the blob container, so nothing here
// loses a capability it was using.
resource scmPolicy 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-04-01' = {
  parent: functionApp
  name: 'scm'
  properties: {
    allow: false
  }
  dependsOn: [
    authSettings
  ]
}

resource ftpPolicy 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-04-01' = {
  parent: functionApp
  name: 'ftp'
  properties: {
    allow: false
  }
  dependsOn: [
    scmPolicy
  ]
}

output name string = functionApp.name
output defaultHostname string = functionApp.properties.defaultHostName

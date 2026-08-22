// The public media store: community logos, technology logos, event banners.
//
// A second account rather than a container on the Function App's host storage, because the
// two need opposite settings. The host storage refuses public blob access and disables
// retention on the stated grounds that it "contains nothing a redeployment does not rebuild";
// a logo handed over by a community is exactly the thing a redeployment does not rebuild.
// Flipping either setting there would weaken the store that holds the deployment package to
// serve images. Two accounts cost the same as one — storage bills per byte, not per account.
//
// No CDN in front of it. Classic Azure CDN is retired, and its recommended replacement,
// Azure Front Door Standard, carries a base fee of 30.75 EUR a month in westeurope before a
// single byte is served — more, on its own, than the whole project's ~25 EUR design cap. At
// LeHub's scale the public blob endpoint with long cache headers is enough.
//
// Standard_LRS, hot: 0.0172 EUR per GB-month and 0.0038 EUR per 10 000 reads in westeurope,
// so a few hundred logos and the traffic of a community agenda land well under 0.10 EUR a
// month. Outbound transfer is inside the free monthly allowance.

param name string
param location string
param tags object

resource mediaStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: name
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    // The one setting this account exists to turn on, and the only place in the project where
    // it is true. It is a ceiling, not a grant: nothing is readable anonymously until a
    // container also asks for it, which only `media` below does.
    allowBlobPublicAccess: true
    // Unchanged from the host storage, and not negotiable. Anonymous read is a property of the
    // container; writing still goes through Entra and the user-assigned managed identity, so
    // no key exists to leak. Note the consequence: with shared keys refused, only a user
    // delegation SAS is available, never an account SAS.
    allowSharedKeyAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: mediaStorage
  name: 'default'
  // Exhaustive on purpose, for the reason storage.bicep records: a deployment rewrites what
  // this block names and erases what it omits, so a partial block silently turns retention
  // back off on every run. Here the decision is the opposite of the host storage's — these
  // bytes came from a community and cannot be regenerated, so a deletion has to be reversible.
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 7
      allowPermanentDelete: false
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

// 'Blob' grants anonymous read on a blob whose exact name is known. 'Container' would also
// let anyone list the container, turning every media reference in the database into a
// public inventory — the wider value is a different decision, not a more convenient one.
//
// Anonymous access level is a control-plane property, set here by the Storage resource
// provider. The data-plane equivalent (`az storage container set-permission`) needs a shared
// key, which this account refuses — so Bicep is not merely the preferred way to set it, it is
// the only one.
resource mediaContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'media'
  properties: {
    publicAccess: 'Blob'
  }
}

output name string = mediaStorage.name

// Both built from the name parameter rather than from primaryEndpoints.blob, which compiles to
// reference(): what-if cannot evaluate it, and every preview would report these as changing.
@description('Host of the media account. Enumerated in the img-src directive of both Static Web Apps.')
output hostname string = '${name}.blob.${environment().suffixes.storage}'

@description('Absolute base of the media container. Becomes MEDIA_BASE_URL on the Function App.')
output baseUrl string = 'https://${name}.blob.${environment().suffixes.storage}/${mediaContainer.name}'

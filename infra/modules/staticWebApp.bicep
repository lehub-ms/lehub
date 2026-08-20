// One Static Web App. Instantiated twice: the public site and the backoffice.
//
// Free tier, deliberately. The Standard tier exists to attach an external Function App
// through a linked backend, and a Function App can only ever be linked to one Static
// Web App — LeHub has two sharing one API, so linking is impossible and Standard would
// buy nothing for roughly 16 EUR a month against a ~25 EUR cap.
//
// There is therefore no Microsoft.Web/staticSites/linkedBackends resource here, and
// there must not be one: both front-ends call the API cross-origin instead.

param name string
param location string
param tags object

resource site 'Microsoft.Web/staticSites@2024-04-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    // Each application ships its own staticwebapp.config.json — security headers, CSP
    // and SPA fallback — and that file is only honoured when this is on.
    allowConfigFileUpdates: true
  }
}

// repositoryUrl, branch and provider are left unset on purpose. Wiring the resource to
// a repository is the continuous deployment feature's job; setting it here would
// recreate the very coupling this repository is moving away from.

output name string = site.name
output defaultHostname string = site.properties.defaultHostname

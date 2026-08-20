// The API's hosting plan, Flex Consumption.
//
// Scales to zero when nobody calls the API, so the cost follows real usage. The plan
// itself is identical in every environment: how many instances stay warm is a property
// of the Function App, not of the plan.
//
// No App Service plan exists for the front-ends — the Static Web Apps host themselves.

param name string
param location string
param tags object

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: name
  location: location
  tags: tags
  // Not 'functionapp,linux': the Web resource provider does not persist the composite
  // form on a serverfarm, it stores 'functionapp'. Declaring what it stores is what
  // keeps every what-if from reporting the same phantom change. Linux is carried by
  // reserved below, which is the property the platform actually reads.
  kind: 'functionapp'
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  properties: {
    // Linux. Moving to or from FC1 is not supported in place: changing this SKU means
    // recreating the plan, and therefore the Function App attached to it.
    reserved: true
  }
}

output id string = plan.id
output name string = plan.name

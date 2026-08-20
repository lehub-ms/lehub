// The spending guard. The project sets itself a cap of around 25 EUR a month, and until
// this module existed that cap lived only in a sentence: nothing in Azure would have said
// anything before the invoice.
//
// A budget is free, and it is a tripwire rather than a limit — it alerts, it never blocks.
// The amounts are set above the expected spend on purpose, so that a notification means
// something is actually wrong and not that the month was busy.

@description('Environment this budget belongs to. Only names the resource.')
param environmentName string

@description('Monthly ceiling in the billing currency. 15 in dev, 50 in prod.')
param monthlyBudgetAmount int

// utcNow() is legal only in a parameter default, and the API refuses a start date outside
// the current period — so a date hard-coded today would fail the first time prod is
// deployed months from now. Declared here rather than in main.bicep so that file keeps its
// three parameters: nothing ever passes this one in.
//
// The cost of that: the first what-if of each month reports the start date moving. Listed
// with the rest of the known noise in docs/deployment.md.
@description('Never passed in. Derived at deployment time.')
param budgetStartDate string = utcNow('yyyy-MM-01')

resource budget 'Microsoft.Consumption/budgets@2024-08-01' = {
  name: 'budget-lehub-${environmentName}'
  properties: {
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
    }
    category: 'Cost'
    amount: monthlyBudgetAmount
    // Notified by role rather than by address: nothing has to be kept in step when a
    // contact changes, and no personal address is committed to a public repository.
    //
    // Four thresholds, because they say different things. The three Actual ones report
    // money already spent; the Forecasted one is the only alert that can still be acted
    // on, since it fires when the month is projected to overrun and not once it has.
    notifications: {
      actual50: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 50
        thresholdType: 'Actual'
        contactEmails: []
        contactRoles: [
          'Owner'
        ]
      }
      actual80: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 80
        thresholdType: 'Actual'
        contactEmails: []
        contactRoles: [
          'Owner'
        ]
      }
      actual100: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 100
        thresholdType: 'Actual'
        contactEmails: []
        contactRoles: [
          'Owner'
        ]
      }
      forecast100: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 100
        thresholdType: 'Forecasted'
        contactEmails: []
        contactRoles: [
          'Owner'
        ]
      }
    }
  }
}

output name string = budget.name

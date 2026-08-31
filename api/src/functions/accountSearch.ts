import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { searchAccounts } from '../lib/accountsRepo'
import { canSearchAccounts } from '../lib/authz'
import { SEARCH_ACCOUNTS } from '../lib/designationSchemas'
import { forbidden, listFetchError, routeLabel } from '../lib/httpErrors'
import { parseBody } from '../lib/validation'
import { withAuthorization, type AuthenticatedSession } from '../lib/withAuthorization'

/**
 * Finding the person to designate, and the only route in this API that reads someone else's name
 * and address.
 *
 * **A POST that creates nothing, deliberately.** The search term is regularly a full email
 * address — Story #157 says so in as many words, and asks that one typed in full match exactly —
 * and Application Insights records a request's whole URL, query string included. A `GET
 * ?q=someone@example.org` would therefore file that address in telemetry on every keystroke's
 * request, in every environment. This API takes the opposite care everywhere else: `forbidden`
 * logs an object identifier and never an address, and a test asserts it. Sending the term in a
 * body keeps that promise instead of quietly undoing it through the front door. Not being
 * cacheable is a bonus rather than a cost: the answer is session-scoped and must never be
 * cached.
 *
 * Authorise, then validate. An ordinary account gets the same 403 whether it sent a usable query
 * or not — otherwise the refusal itself would tell them what a usable query looks like.
 */
export async function accountSearch(
  request: HttpRequest,
  context: InvocationContext,
  session: AuthenticatedSession,
): Promise<HttpResponseInit> {
  if (!canSearchAccounts(session.permissions)) {
    return forbidden(context, {
      route: routeLabel(request),
      action: 'search:accounts',
      objectId: session.identity.objectId,
    })
  }

  // A query below the minimum length is refused rather than answered with nothing: the panel
  // announces the bound, and a silent empty answer would read as "no such person".
  const body = await parseBody(request, context, SEARCH_ACCOUNTS)
  if (!body.ok) return body.response

  try {
    return { status: 200, jsonBody: await searchAccounts(body.value.q) }
  } catch (error) {
    return listFetchError(
      context,
      'Failed to search LeHub accounts',
      error,
      'ACCOUNT_SEARCH_ERROR',
      'Unable to search accounts.',
    )
  }
}

app.http('accountSearch', {
  methods: ['POST'],
  authLevel: 'anonymous',
  // `manage/` and not `admin/`: the Functions host reserves `/admin` for its own management API
  // and refuses to start any function whose route begins with it. See adminCommunities.ts.
  route: 'manage/accounts/search',
  handler: withAuthorization(accountSearch),
})

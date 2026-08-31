import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { canWriteReferenceData } from '../lib/authz'
import { listAdminCommunities } from '../lib/communitiesRepo'
import { forbidden, listFetchError, routeLabel } from '../lib/httpErrors'
import { withAuthorization, type AuthenticatedSession } from '../lib/withAuthorization'

/**
 * The administration view of the community referential: every community, archived ones included,
 * with the counts the screen decides from.
 *
 * A route of its own rather than a parameter on the public `communities`, and the reasons are
 * three. `withAuth`'s doc comment enumerates the anonymous routes as a *decision written down*; a
 * parameter that flips a route between anonymous and authenticated turns that enumeration into a
 * lie. The two answers are different shapes, and one handler returning either would hand every
 * caller a union to narrow for nothing. And the public listing is cacheable while this one is
 * resolved per session and must never be — one URL cannot hold both policies.
 *
 * Reading it is arbitrated, unusually for this API, and by the *write* predicate: this is not the
 * reference data, it is the administration view of it. See the header of lib/authz.
 */
export async function adminCommunities(
  request: HttpRequest,
  context: InvocationContext,
  session: AuthenticatedSession,
): Promise<HttpResponseInit> {
  if (!canWriteReferenceData(session.permissions)) {
    return forbidden(context, {
      route: routeLabel(request),
      action: 'read:admin-communities',
      objectId: session.identity.objectId,
    })
  }

  try {
    return { status: 200, jsonBody: await listAdminCommunities() }
  } catch (error) {
    return listFetchError(
      context,
      'Failed to list communities for administration',
      error,
      'ADMIN_COMMUNITIES_FETCH_ERROR',
      'Unable to list communities.',
    )
  }
}

app.http('adminCommunities', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'admin/communities',
  handler: withAuthorization(adminCommunities),
})

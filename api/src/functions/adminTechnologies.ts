import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { canWriteReferenceData } from '../lib/authz'
import { listAdminTechnologies } from '../lib/technologiesRepo'
import { forbidden, listFetchError, routeLabel } from '../lib/httpErrors'
import { withAuthorization, type AuthenticatedSession } from '../lib/withAuthorization'

/**
 * The administration view of the technology referential: every technology, archived ones
 * included, with the event count the screen decides from.
 *
 * Why a route of its own rather than a parameter on a public listing, and why reading it is
 * arbitrated by the *write* predicate: see functions/adminCommunities.ts, which says it once.
 *
 * There is no public `GET /api/technologies` for this to sit beside. The public site derives its
 * technology filter from the events it has already fetched, so nothing needs one yet — and
 * inventing it here would settle a question that belongs to the public-filters feature: all
 * technologies, or only those an upcoming event carries.
 */
export async function adminTechnologies(
  request: HttpRequest,
  context: InvocationContext,
  session: AuthenticatedSession,
): Promise<HttpResponseInit> {
  if (!canWriteReferenceData(session.permissions)) {
    return forbidden(context, {
      route: routeLabel(request),
      action: 'read:admin-technologies',
      objectId: session.identity.objectId,
    })
  }

  try {
    return { status: 200, jsonBody: await listAdminTechnologies() }
  } catch (error) {
    return listFetchError(
      context,
      'Failed to list technologies for administration',
      error,
      'ADMIN_TECHNOLOGIES_FETCH_ERROR',
      'Unable to list technologies.',
    )
  }
}

app.http('adminTechnologies', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'admin/technologies',
  handler: withAuthorization(adminTechnologies),
})

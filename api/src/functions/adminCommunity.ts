import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { canWriteReferenceData } from '../lib/authz'
import { updateCommunity } from '../lib/communitiesRepo'
import { errorResponse, forbidden, listFetchError, routeLabel } from '../lib/httpErrors'
import { UPDATE_COMMUNITY } from '../lib/referenceSchemas'
import { guidParam, parseBody } from '../lib/validation'
import { withAuthorization, type AuthenticatedSession } from '../lib/withAuthorization'

/**
 * One community: modify it.
 *
 * PATCH and not PUT. Reactivating an entry from its row sends `{ "status": "active" }` alone; a
 * PUT would force that row to resend the name, the logo and the description it never read, and
 * race whatever a concurrent edit had just written. **A field that is absent is a field left
 * alone**, which is not the same as one explicitly set to null — clearing a description is a
 * legitimate edit and says so with `null`.
 *
 * This is one of the first routes in this API to carry a path parameter, and `guidParam` is why
 * a malformed one answers 400 rather than surfacing an mssql driver error as a 500.
 */
export async function adminCommunity(
  request: HttpRequest,
  context: InvocationContext,
  session: AuthenticatedSession,
): Promise<HttpResponseInit> {
  if (!canWriteReferenceData(session.permissions)) {
    return forbidden(context, {
      route: routeLabel(request),
      action: 'update:community',
      objectId: session.identity.objectId,
    })
  }

  const id = guidParam(request, context, 'communityId')
  if (!id.ok) return id.response

  const body = await parseBody(request, context, UPDATE_COMMUNITY)
  if (!body.ok) return body.response

  let result
  try {
    result = await updateCommunity(id.value, body.value)
  } catch (error) {
    return listFetchError(
      context,
      'Failed to update a community',
      error,
      'COMMUNITY_WRITE_ERROR',
      'Unable to update the community.',
    )
  }

  if (!result.ok) {
    if (result.error === 'name-taken') {
      return errorResponse(409, 'COMMUNITY_NAME_TAKEN', 'Another community already has this name.')
    }
    return errorResponse(404, 'COMMUNITY_NOT_FOUND', 'No community carries this identifier.')
  }

  return { status: 200, jsonBody: result.community }
}

app.http('adminCommunity', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'admin/communities/{communityId}',
  handler: withAuthorization(adminCommunity),
})

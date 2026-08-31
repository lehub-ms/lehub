import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { canWriteReferenceData } from '../lib/authz'
import { deleteCommunity, updateCommunity } from '../lib/communitiesRepo'
import {
  conflictWithCount,
  errorResponse,
  forbidden,
  listFetchError,
  routeLabel,
} from '../lib/httpErrors'
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
      action: request.method === 'DELETE' ? 'delete:community' : 'update:community',
      objectId: session.identity.objectId,
    })
  }

  const id = guidParam(request, context, 'communityId')
  if (!id.ok) return id.response

  if (request.method === 'DELETE') return remove(id.value, context)

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

/**
 * Permanent deletion, offered only for an entry no event references.
 *
 * The screen already knows the count and hides the action when it is not zero, so reaching this
 * refusal means the count changed underneath — which is exactly the race #155 describes. The
 * database settles it, and the answer carries the number so the panel can say it.
 */
async function remove(id: string, context: InvocationContext): Promise<HttpResponseInit> {
  let result
  try {
    result = await deleteCommunity(id)
  } catch (error) {
    return listFetchError(
      context,
      'Failed to delete a community',
      error,
      'COMMUNITY_WRITE_ERROR',
      'Unable to delete the community.',
    )
  }

  if (!result.ok) {
    if (result.error === 'referenced') {
      return conflictWithCount(
        'REFERENCE_IN_USE',
        'Events still reference this entry; archive it instead.',
        result.eventCount,
      )
    }
    return errorResponse(404, 'COMMUNITY_NOT_FOUND', 'No community carries this identifier.')
  }

  return { status: 204 }
}

app.http('adminCommunity', {
  methods: ['PATCH', 'DELETE'],
  authLevel: 'anonymous',
  route: 'admin/communities/{communityId}',
  handler: withAuthorization(adminCommunity),
})

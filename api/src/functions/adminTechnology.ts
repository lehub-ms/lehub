import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { canWriteReferenceData } from '../lib/authz'
import { deleteTechnology, updateTechnology } from '../lib/technologiesRepo'
import {
  conflictWithCount,
  errorResponse,
  forbidden,
  listFetchError,
  routeLabel,
} from '../lib/httpErrors'
import { UPDATE_TECHNOLOGY } from '../lib/referenceSchemas'
import { guidParam, parseBody } from '../lib/validation'
import { withAuthorization, type AuthenticatedSession } from '../lib/withAuthorization'

/**
 * One technology: modify it.
 *
 * PATCH, absent field means unchanged, and a GUID-only path parameter: the reasoning is the same
 * as for a community, and functions/adminTechnology.ts holds it.
 */
export async function adminTechnology(
  request: HttpRequest,
  context: InvocationContext,
  session: AuthenticatedSession,
): Promise<HttpResponseInit> {
  if (!canWriteReferenceData(session.permissions)) {
    return forbidden(context, {
      route: routeLabel(request),
      action: request.method === 'DELETE' ? 'delete:technology' : 'update:technology',
      objectId: session.identity.objectId,
    })
  }

  const id = guidParam(request, context, 'technologyId')
  if (!id.ok) return id.response

  if (request.method === 'DELETE') return remove(id.value, context)

  const body = await parseBody(request, context, UPDATE_TECHNOLOGY)
  if (!body.ok) return body.response

  let result
  try {
    result = await updateTechnology(id.value, body.value)
  } catch (error) {
    return listFetchError(
      context,
      'Failed to update a technology',
      error,
      'TECHNOLOGY_WRITE_ERROR',
      'Unable to update the technology.',
    )
  }

  if (!result.ok) {
    if (result.error === 'name-taken') {
      return errorResponse(409, 'TECHNOLOGY_NAME_TAKEN', 'Another technology already has this name.')
    }
    return errorResponse(404, 'TECHNOLOGY_NOT_FOUND', 'No technology carries this identifier.')
  }

  return { status: 200, jsonBody: result.technology }
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
    result = await deleteTechnology(id)
  } catch (error) {
    return listFetchError(
      context,
      'Failed to delete a technology',
      error,
      'TECHNOLOGY_WRITE_ERROR',
      'Unable to delete the technology.',
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
    return errorResponse(404, 'TECHNOLOGY_NOT_FOUND', 'No technology carries this identifier.')
  }

  return { status: 204 }
}

app.http('adminTechnology', {
  methods: ['PATCH', 'DELETE'],
  authLevel: 'anonymous',
  route: 'admin/technologies/{technologyId}',
  handler: withAuthorization(adminTechnology),
})

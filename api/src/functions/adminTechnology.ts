import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { canWriteReferenceData } from '../lib/authz'
import { updateTechnology } from '../lib/technologiesRepo'
import { errorResponse, forbidden, listFetchError, routeLabel } from '../lib/httpErrors'
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
      action: 'update:technology',
      objectId: session.identity.objectId,
    })
  }

  const id = guidParam(request, context, 'technologyId')
  if (!id.ok) return id.response

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

app.http('adminTechnology', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'admin/technologies/{technologyId}',
  handler: withAuthorization(adminTechnology),
})

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { canWriteReferenceData } from '../lib/authz'
import { createTechnology, listAdminTechnologies } from '../lib/technologiesRepo'
import { errorResponse, forbidden, listFetchError, routeLabel } from '../lib/httpErrors'
import { CREATE_TECHNOLOGY } from '../lib/referenceSchemas'
import { parseBody } from '../lib/validation'
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
      action: request.method === 'POST' ? 'create:technology' : 'read:managed-technologies',
      objectId: session.identity.objectId,
    })
  }

  if (request.method === 'POST') return create(request, context)

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

/** Authorise first, validate second — see the community collection for why. */
async function create(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const body = await parseBody(request, context, CREATE_TECHNOLOGY)
  if (!body.ok) return body.response

  let result
  try {
    result = await createTechnology(body.value)
  } catch (error) {
    return listFetchError(
      context,
      'Failed to create a technology',
      error,
      'TECHNOLOGY_WRITE_ERROR',
      'Unable to create the technology.',
    )
  }

  if (!result.ok) {
    return errorResponse(409, 'TECHNOLOGY_NAME_TAKEN', 'Another technology already has this name.')
  }

  return { status: 201, jsonBody: result.technology }
}

app.http('adminTechnologies', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  // `manage/` and not `admin/`: the Functions host reserves `/admin` for its own management
  // API, and refuses to start any function whose route begins with it — "The specified route
  // conflicts with one or more built in routes". The reservation is the host's, not the route
  // prefix's, so `api/admin/...` is refused just the same. The file and function names keep
  // saying `admin`, because they describe who the route is for; only the URL had to move.
  route: 'manage/technologies',
  handler: withAuthorization(adminTechnologies),
})

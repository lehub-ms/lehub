import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import {
  grantGlobalAdmin,
  listGlobalAdmins,
  revokeGlobalAdmin,
} from '../lib/administratorsRepo'
import { canManageGlobalAdmins } from '../lib/authz'
import { ACCOUNT_EMAIL } from '../lib/designationSchemas'
import { designationRefusal } from '../lib/designationResponses'
import { errorResponse, forbidden, listFetchError, routeLabel } from '../lib/httpErrors'
import { parseBody } from '../lib/validation'
import { withAuthorization, type AuthenticatedSession } from '../lib/withAuthorization'

/** The trace's vocabulary, one entry per verb. */
const ACTIONS: Record<string, string> = {
  GET: 'read:global-admins',
  POST: 'grant:global-admin',
  DELETE: 'revoke:global-admin',
}

/**
 * The global administrators: reading them, promoting one, demoting one.
 *
 * Administrators only, always — nobody awards themselves that quality and no organiser can hand
 * it out. That is the whole of `canManageGlobalAdmins`, and it is why this route carries no
 * community: the marker has no perimeter.
 *
 * The other half of the story's rule — the last administrator cannot be removed — is *not* here.
 * It depends on how many administrators remain, which is a count and not a session, so it lives
 * in the statement that removes one. See `administratorsRepo`.
 *
 * Like the organisers, the address travels in a body rather than in a path segment: Application
 * Insights records the whole URL of every request. See `lib/designationSchemas`.
 */
export async function administrators(
  request: HttpRequest,
  context: InvocationContext,
  session: AuthenticatedSession,
): Promise<HttpResponseInit> {
  if (!canManageGlobalAdmins(session.permissions)) {
    return forbidden(context, {
      route: routeLabel(request),
      action: ACTIONS[request.method] ?? 'write:global-admins',
      objectId: session.identity.objectId,
    })
  }

  if (request.method === 'POST') return grant(request, context)
  if (request.method === 'DELETE') return revoke(request, context)

  try {
    return { status: 200, jsonBody: await listGlobalAdmins() }
  } catch (error) {
    return listFetchError(
      context,
      'Failed to list the global administrators',
      error,
      'GLOBAL_ADMINS_FETCH_ERROR',
      'Unable to list the administrators.',
    )
  }
}

/**
 * Authorise first, validate second — an organiser must receive the same 403 whether their body
 * was well-formed or not.
 *
 * Nothing is written to `dbo.AdminBootstrap`: see the header of `administratorsRepo` for why a
 * backoffice promotion must not be registered as a seed intent.
 */
async function grant(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const body = await parseBody(request, context, ACCOUNT_EMAIL)
  if (!body.ok) return body.response

  let result
  try {
    result = await grantGlobalAdmin(body.value.email)
  } catch (error) {
    return listFetchError(
      context,
      'Failed to grant the global administrator marker',
      error,
      'GLOBAL_ADMIN_WRITE_ERROR',
      'Unable to designate the administrator.',
    )
  }

  if (!result.ok) return designationRefusal(result)

  return { status: 201, jsonBody: result.account }
}

/**
 * 409 for the last administrator, 204 for everything else.
 *
 * A 409 and not a 403: this is not a permission — the caller is entitled to revoke, and would
 * be entitled to revoke this very account if another administrator existed — and it must not be
 * logged as an authorisation event. Not a 400 either: the request is perfectly well formed.
 */
async function revoke(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const body = await parseBody(request, context, ACCOUNT_EMAIL)
  if (!body.ok) return body.response

  let result
  try {
    result = await revokeGlobalAdmin(body.value.email)
  } catch (error) {
    return listFetchError(
      context,
      'Failed to revoke the global administrator marker',
      error,
      'GLOBAL_ADMIN_WRITE_ERROR',
      'Unable to remove the administrator.',
    )
  }

  if (!result.ok) {
    return errorResponse(
      409,
      'LAST_GLOBAL_ADMIN',
      'The last global administrator cannot be removed.',
    )
  }

  return { status: 204 }
}

app.http('administrators', {
  methods: ['GET', 'POST', 'DELETE'],
  authLevel: 'anonymous',
  // `manage/` and not `admin/`: the Functions host reserves `/admin` for its own management API
  // and refuses to start any function whose route begins with it. See adminCommunities.ts.
  route: 'manage/administrators',
  handler: withAuthorization(administrators),
})

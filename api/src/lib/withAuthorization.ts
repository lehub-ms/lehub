import { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { errorResponse } from './httpErrors'
import { resolveSessionPermissions, type SessionPermissions } from './permissionsRepo'
import { type AuthenticatedIdentity } from './tokenValidation'
import { withAuth, type AuthenticatedHandler } from './withAuth'

/**
 * Everything a route needs to know about its caller: who they are, and what they may do.
 *
 * The two halves come from two different places on purpose. The identity comes from the
 * validated token; the permissions come from the LeHub database. No role is ever derived
 * from a claim, anywhere — that is the single property a review of this feature should be
 * able to check by reading permissionsRepo.ts and this file, and nothing else.
 */
export interface AuthenticatedSession {
  identity: AuthenticatedIdentity
  permissions: SessionPermissions
}

export type AuthorizedHandler = (
  request: HttpRequest,
  context: InvocationContext,
  session: AuthenticatedSession,
) => Promise<HttpResponseInit>

/**
 * The inner half, between `withAuth` and the route.
 *
 * `resolvePermissions` is a parameter rather than a hard-wired import so this layer can be
 * exercised on its own — including the failure path, which is the one that must never be
 * allowed to fall back to empty permissions. The default is the real repository, and no
 * caller in `src/` passes anything else.
 */
export function authorized(
  handler: AuthorizedHandler,
  resolvePermissions: (objectId: string) => Promise<SessionPermissions> = resolveSessionPermissions,
): AuthenticatedHandler {
  return async (request, context, identity) => {
    let permissions: SessionPermissions
    try {
      permissions = await resolvePermissions(identity.objectId)
    } catch (error) {
      // A 500, never a default set of permissions. Answering with empty ones would turn a
      // database outage into a blanket authorisation refusal that reads, to the client, as
      // "you are not allowed" rather than "we could not tell".
      context.error('Failed to resolve the session permissions', {
        route: `${request.method} ${new URL(request.url).pathname}`,
        objectId: identity.objectId,
        error,
      })
      return errorResponse(500, 'PERMISSIONS_UNAVAILABLE', 'Unable to resolve the session permissions.')
    }

    return handler(request, context, { identity, permissions })
  }
}

/**
 * Wraps a handler so it only ever runs with a verified identity *and* resolved permissions.
 *
 * Composes `withAuth` rather than replacing it: the relay routes under `auth/*` authenticate
 * without having any permissions to resolve, and the anonymous listings authenticate not at
 * all. Keeping the two wrappers apart is what makes "the resolution does not run on anonymous
 * routes" true by construction rather than by vigilance.
 *
 * The read it costs — one per authenticated request — is the price of a designation removal
 * taking effect immediately. See permissionsRepo.
 */
export function withAuthorization(handler: AuthorizedHandler): HttpHandler {
  return withAuth(authorized(handler))
}

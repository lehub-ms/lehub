import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { errorResponse, listFetchError } from '../lib/httpErrors'
import { resolveName, usableClaim } from '../lib/identityClaims'
import { resolveSessionPermissions } from '../lib/permissionsRepo'
import { type AuthenticatedIdentity } from '../lib/tokenValidation'
import { mirrorUser, type AuthMethod } from '../lib/userRepo'
import { withAuth } from '../lib/withAuth'

/**
 * Opens a session on the LeHub side: creates the mirror row on a first sign-in, refreshes it
 * on every one after, and answers with the identity and what it is allowed to do.
 *
 * The identity comes from the validated token and from nowhere else. The one exception is
 * `resolveName` in lib/identityClaims, and it is deliberately the only one.
 *
 * The permissions are a convenience for the client, never the decision: the backoffice uses
 * them to choose what it renders, and the server refuses identically whether a button was
 * hidden or not. They carry nothing about any other account — no user list, no one else's
 * permissions.
 *
 * This is the one route that resolves them by hand rather than through `withAuthorization`,
 * and the ordering is the reason. The wrapper resolves before the handler runs, which on a
 * first sign-in would read a mirror row that does not exist yet — and would miss the
 * administrator promotion that `mirrorUser` itself applies (#106). Resolved after the
 * mirror, and once.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function session(
  request: HttpRequest,
  context: InvocationContext,
  identity: AuthenticatedIdentity,
): Promise<HttpResponseInit> {
  // An absent or unreadable body is not an error here: it is simply a sign-in with nothing to
  // fall back on, which is the normal case once the claims are complete.
  let submitted: Record<string, unknown> = {}
  try {
    const body: unknown = await request.json()
    if (isRecord(body)) submitted = body
  } catch {
    submitted = {}
  }

  const givenName = resolveName(identity.givenName, submitted['givenName'])
  const surname = resolveName(identity.familyName, submitted['surname'])

  // No fallback for the address: a display name a visitor asserts about themselves is their
  // own business, an identity is not. It comes from the claim or the sign-in does not mirror.
  const email = usableClaim(identity.email)

  if (identity.givenName === null || identity.familyName === null) {
    context.warn('Sign-in with incomplete name claims', {
      objectId: identity.objectId,
      hasGivenNameClaim: identity.givenName !== null,
      hasFamilyNameClaim: identity.familyName !== null,
      recoveredFromRequest: givenName !== null && surname !== null,
    })
  }

  // Always 'email' in this feature. #99 adds the personal Microsoft account and will read the
  // method off the token's `idp` claim rather than assume it here.
  const authMethod: AuthMethod = 'email'

  let result
  try {
    result = await mirrorUser({ objectId: identity.objectId, email, givenName, surname, authMethod })
  } catch (error) {
    return listFetchError(context, 'Failed to mirror the authenticated identity', error, 'SESSION_MIRROR_ERROR', 'Unable to open the session.')
  }

  if (!result.ok) {
    if (result.error === 'email-taken') {
      context.error('Refused to mirror an address already held by another account', {
        objectId: identity.objectId,
      })
      return errorResponse(409, 'EMAIL_ALREADY_MIRRORED', 'This address is already mirrored under another account.')
    }
    // Nothing was written, and nothing was invented. The navigation falls back to a neutral
    // label (#97) and the row is created on a later sign-in, once the claims are complete.
    context.error('Refused to create a mirror row without a usable identity', {
      objectId: identity.objectId,
      hasEmail: email !== null,
      hasGivenName: givenName !== null,
      hasSurname: surname !== null,
    })
    return errorResponse(409, 'INCOMPLETE_IDENTITY', 'The token carries no usable name, and none was supplied.')
  }

  let permissions
  try {
    permissions = await resolveSessionPermissions(identity.objectId)
  } catch (error) {
    // The mirror was written; only the permissions could not be read. A 500 rather than an
    // empty set, for the same reason as everywhere else: "no permissions" and "we could not
    // tell" must not look alike to the client.
    return listFetchError(context, 'Failed to resolve the session permissions', error, 'PERMISSIONS_UNAVAILABLE', 'Unable to resolve the session permissions.')
  }

  return { status: result.created ? 201 : 200, jsonBody: { user: result.user, permissions } }
}

// `authLevel: 'anonymous'` is about the Functions host's own function keys, which this API
// does not use anywhere. The gate on this route is `withAuth`, and it is the only one.
app.http('session', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'me/session',
  handler: withAuth(session),
})

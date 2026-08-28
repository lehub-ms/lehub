import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { errorResponse, listFetchError } from '../lib/httpErrors'
import { resolveName, usableClaim } from '../lib/identityClaims'
import { type AuthenticatedIdentity } from '../lib/tokenValidation'
import { mirrorUser, type AuthMethod } from '../lib/userRepo'
import { withAuth } from '../lib/withAuth'

/**
 * Opens a session on the LeHub side: creates the mirror row on a first sign-in, refreshes it
 * on every one after. Called by the SPA once the tenant has issued its tokens.
 *
 * The identity comes from the validated token and from nowhere else. The one exception is
 * `resolveName` in lib/identityClaims, and it is deliberately the only one.
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

  return { status: result.created ? 201 : 200, jsonBody: result.user }
}

// `authLevel: 'anonymous'` is about the Functions host's own function keys, which this API
// does not use anywhere. The gate on this route is `withAuth`, and it is the only one.
app.http('session', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'me/session',
  handler: withAuth(session),
})

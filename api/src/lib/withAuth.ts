import { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { decodeJwt } from 'jose'
import { buildEntraConfig, describeEntraConfigError } from './entraConfig'
import { errorResponse } from './httpErrors'
import { bearerToken, verifyAccessToken, type AuthenticatedIdentity } from './tokenValidation'

/**
 * Wraps a handler so it only ever runs with a verified identity.
 *
 * Which routes are anonymous is a decision, so it is written down rather than left to
 * whoever forgets the wrapper. Anonymous, and deliberately so:
 *
 *   - `health`        — the deployment probe, polled before anyone has a token
 *   - `events`        — the public agenda, the whole point of the site
 *   - `communities`   — likewise
 *   - `technologies`  — likewise, and #147 needs it: attaching a technology to an event is an
 *     organiser's job, while `manage/technologies` is closed to anyone who is not a global
 *     administrator. The public half of the referential is what an organiser reads.
 *   - `event-options` — the two closed vocabularies an event is qualified by. Same reason, and
 *     there is nothing to withhold in the word "Meetup".
 *   - `auth/signup`, `auth/signin`, `auth/reset`, `auth/token` — a visitor creating an
 *     account, or one who has lost their password, has nothing to present
 *
 * Everything else authenticates. A 401 here means "no usable token" and is distinct from the
 * 403 an authorisation refusal will produce (#109): one is answered by signing in, the other
 * never is, and a client that cannot tell them apart loops.
 */
export type AuthenticatedHandler = (
  request: HttpRequest,
  context: InvocationContext,
  identity: AuthenticatedIdentity,
) => Promise<HttpResponseInit>

/** Truncated hard: these come off an unverified token and are attacker-controlled. */
function forLog(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 120)
  if (Array.isArray(value)) return value.map(forLog).join(',').slice(0, 120)
  return typeof value
}

/**
 * What the token *claimed*, read without verifying anything, for the logs only.
 *
 * An audience or issuer mismatch is otherwise the hardest 401 to diagnose: the token is
 * perfectly valid, just not for us, and nothing in the failure says what it was for.
 */
function claimedFor(token: string): { aud: string; iss: string } | null {
  try {
    const payload = decodeJwt(token)
    return { aud: forLog(payload.aud), iss: forLog(payload.iss) }
  } catch {
    return null
  }
}

export function withAuth(handler: AuthenticatedHandler): HttpHandler {
  return async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const configResult = buildEntraConfig()
    if (!configResult.ok) {
      context.error(`Token validation unusable: ${describeEntraConfigError(configResult.error)}`)
      return errorResponse(500, 'ENTRA_NOT_CONFIGURED', 'The identity provider is not configured.')
    }

    // The route and the cause are what a diagnosis needs; App Insights stamps the time itself.
    const route = `${request.method} ${new URL(request.url).pathname}`

    const token = bearerToken(request.headers.get('authorization'))
    if (!token) {
      context.error('Authentication refused', { route, reason: 'no-bearer-token' })
      return errorResponse(401, 'UNAUTHENTICATED', 'A bearer token is required.')
    }

    const result = await verifyAccessToken(token, configResult.config)
    if (!result.ok) {
      const { reason, detail } = result.refusal

      // Neither the token nor a verified claim is ever written here. `claimed` is explicitly
      // the unverified header of a token we just rejected, and is labelled as such.
      context.error('Authentication refused', {
        route,
        reason,
        detail,
        claimed: reason === 'invalid' ? claimedFor(token) : null,
      })

      if (reason === 'jwks-unavailable') {
        // Unreadable keys are a server fault. Answering 401 would tell the client to sign in
        // again, which cannot possibly help, and would hide an outage as a user error.
        return errorResponse(500, 'TOKEN_KEYS_UNAVAILABLE', 'The identity provider keys are unavailable.')
      }
      if (reason === 'expired') {
        // Named apart so the SPA renews and retries instead of dropping the session.
        return errorResponse(401, 'TOKEN_EXPIRED', 'The access token has expired.')
      }
      return errorResponse(401, 'UNAUTHENTICATED', 'The access token is not valid.')
    }

    return handler(request, context, result.identity)
  }
}

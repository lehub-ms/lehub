import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { relayNativeAuth } from '../lib/nativeAuth'

/**
 * Token renewal: the single `refresh` step.
 *
 * Anonymous like its siblings — the refresh token is the credential, and it is checked by the
 * tenant, not here. Kept apart from the three flow routes because it is reached from an open
 * session rather than from a parcours, and #96 renews ahead of expiry rather than after a
 * request has already failed.
 */
export async function authToken(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  return relayNativeAuth('token', request, context)
}

app.http('authToken', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/token',
  handler: authToken,
})

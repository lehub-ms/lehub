import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { relayNativeAuth } from '../lib/nativeAuth'

/**
 * Sign-up, relayed step by step: `start`, `challenge`, `continue`, `token`.
 *
 * Anonymous by construction — a visitor creating an account has no token yet. This and its
 * three siblings are the unauthenticated surface of the API, and #94's wrapper deliberately
 * leaves them alone.
 */
export async function authSignup(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  return relayNativeAuth('signup', request, context)
}

app.http('authSignup', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/signup',
  handler: authSignup,
})

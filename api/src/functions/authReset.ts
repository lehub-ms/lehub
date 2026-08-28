import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { relayNativeAuth } from '../lib/nativeAuth'

/**
 * Self-service password reset, relayed step by step: `start`, `challenge`, `continue`,
 * `submit`, `poll`, `token`. Anonymous by construction — someone who has lost their password
 * cannot present one.
 */
export async function authReset(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  return relayNativeAuth('reset', request, context)
}

app.http('authReset', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/reset',
  handler: authReset,
})

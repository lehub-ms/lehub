import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { relayNativeAuth } from '../lib/nativeAuth'

/** Sign-in, relayed step by step: `start`, `challenge`, `token`. Anonymous by construction. */
export async function authSignin(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  return relayNativeAuth('signin', request, context)
}

app.http('authSignin', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/signin',
  handler: authSignin,
})

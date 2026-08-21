import { HttpResponseInit, InvocationContext } from '@azure/functions'

/**
 * Logs the real failure and returns the stable, detail-free 500 body every list
 * endpoint answers with. The message can name a server or a database, so it goes to
 * the logs and never to the client; the caller gets a stable code it can branch on.
 */
export function listFetchError(
  context: InvocationContext,
  logMessage: string,
  error: unknown,
  code: string,
  message: string,
): HttpResponseInit {
  context.error(logMessage, error)
  return { status: 500, jsonBody: { code, message } }
}

import { HttpResponseInit, InvocationContext } from '@azure/functions'

/**
 * The one place the `{ code, message }` error body is shaped.
 *
 * `code` is a stable SCREAMING_SNAKE string the client branches on; `message` is a short
 * English sentence for a developer reading a network tab. Neither is ever shown to a user —
 * the French copy is the front-end's job.
 */
export function errorResponse(status: number, code: string, message: string): HttpResponseInit {
  return { status, jsonBody: { code, message } }
}

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
  return errorResponse(500, code, message)
}

import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'

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
 * Refuses a write the caller is not entitled to make, and leaves the trace that refusal owes.
 *
 * A 403, deliberately distinct from `withAuth`'s 401: one is answered by signing in, the
 * other never is, and a client that cannot tell them apart loops on the sign-in screen.
 *
 * The message is the same for every refusal and names nothing. Saying "this event does not
 * belong to your community" would confirm that the event exists to someone who has no
 * business knowing — a refusal must not become a way of enumerating what is there.
 *
 * The log carries the route, the action and the caller's object identifier, and nothing more.
 * Never the token, never a claim: an object identifier is enough to find who called, and a
 * security log that carried credentials would be a liability rather than a record.
 */
export function forbidden(
  context: InvocationContext,
  refusal: { route: string; action: string; objectId: string },
): HttpResponseInit {
  context.error('Authorization refused', refusal)
  return errorResponse(403, 'FORBIDDEN', 'This action is not allowed for this account.')
}

/**
 * Refuses a request whose permissions could not be read, and leaves the same trace wherever it
 * happens.
 *
 * A 500 and never an empty set of permissions: answering with none would turn a database
 * outage into a blanket authorisation refusal that reads, to the client, as "you are not
 * allowed" rather than "we could not tell".
 *
 * It lives here rather than in `withAuthorization` because two routes answer it — every wrapped
 * one, and `me/session`, which resolves by hand after writing the mirror. Written twice, the
 * two spellings had already drifted: only one of them logged the route and the caller, which
 * the non-negotiable on logging authorisation events does not make optional.
 */
export function permissionsUnavailable(
  context: InvocationContext,
  request: HttpRequest,
  objectId: string,
  error: unknown,
): HttpResponseInit {
  context.error('Failed to resolve the session permissions', {
    route: `${request.method} ${new URL(request.url).pathname}`,
    objectId,
    error,
  })
  return errorResponse(500, 'PERMISSIONS_UNAVAILABLE', 'Unable to resolve the session permissions.')
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

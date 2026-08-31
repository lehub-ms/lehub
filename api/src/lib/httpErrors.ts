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
 * `POST /api/admin/communities` — the route as every trace in this file spells it.
 *
 * Written once because it was already written twice, and the two spellings had started to
 * drift. `withAuth` keeps its own inline copy: it builds the label before it has anything to
 * log and reuses it for both of its refusals.
 */
export function routeLabel(request: HttpRequest): string {
  return `${request.method} ${new URL(request.url).pathname}`
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
    route: routeLabel(request),
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

/**
 * One field of a refused body, as the log records it: where it was, and what was wrong with
 * it. Never *what it contained*.
 */
export interface ValidationIssue {
  /** Dotted path from the root of the body; `(root)` when the whole body is wrong. */
  path: string
  /** The schema's own vocabulary — `too_small`, `invalid_type`, `unrecognized_keys`… */
  code: string
}

/**
 * Refuses a body that does not match its schema.
 *
 * A 400 and not a 403, and the distinction is the one `withAuth` already draws between 401 and
 * 403: a 400 is answered by sending something else, a 403 never is. A client that cannot tell
 * them apart either loops or gives up.
 *
 * The message is constant and describes nothing. It never echoes the received value — a body is
 * attacker-controlled, and reflecting it turns an error message into a mirror. The paths and the
 * codes go to the log instead, which is the same split `forbidden` makes: enough to diagnose,
 * nothing to exploit. `issues` is deliberately a narrowed shape rather than the validator's own
 * issue objects, which carry the offending input on some of their variants.
 */
export function invalidBody(
  context: InvocationContext,
  request: HttpRequest,
  issues: readonly ValidationIssue[],
): HttpResponseInit {
  context.error('Body validation refused', { route: routeLabel(request), issues })
  return errorResponse(400, 'INVALID_BODY', 'The request body does not match the expected shape.')
}

/**
 * Refuses a route parameter that is not in the expected form, before anything reaches the
 * database.
 *
 * Named apart from `INVALID_BODY` because it is a different bug on the caller's side: a
 * malformed identifier in a URL is a broken link or a hand-edited address, not a bad form
 * submission, and a client branches on it differently. Only the parameter's *name* is logged;
 * its value is already in the path the label carries, as it is for every other trace here.
 */
export function invalidRouteParameter(
  context: InvocationContext,
  request: HttpRequest,
  parameter: string,
): HttpResponseInit {
  context.error('Route parameter refused', { route: routeLabel(request), parameter })
  return errorResponse(
    400,
    'INVALID_ROUTE_PARAMETER',
    'A route parameter is not in the expected form.',
  )
}

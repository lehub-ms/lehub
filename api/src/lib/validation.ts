import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { z } from 'zod'
import { invalidBody, invalidRouteParameter, type ValidationIssue } from './httpErrors'

/**
 * How a request body becomes a value this API is willing to act on.
 *
 * The rule, stated once so the routes do not each restate it: **every route that accepts a body
 * LeHub owns validates it against a declared schema.** The schemas live next to this file, one
 * module per family, exported as plain constants — importable and assertable without a server,
 * exactly like the SQL constants the repositories export.
 *
 * They are runtime schemas and not TypeScript types because TypeScript is erased. A contract
 * described by hand drifts from the code at the first change; a schema is the one source from
 * which both the validation and the description can be taken, which is what Feature #170 will
 * derive its OpenAPI document from. `api/test/openapiDerivation.test.ts` fails the day a schema
 * stops being describable, rather than the day someone opens that document.
 *
 * **Two routes are exempt, and naming them is part of the convention** — an exception nobody
 * wrote down is not an exception, it is a hole:
 *
 *   - `auth/signup`, `auth/signin`, `auth/reset`, `auth/token` (lib/nativeAuth.ts) — a relay.
 *     The contract it validates is Entra's native-auth endpoints', not LeHub's; its step table
 *     is already a declarative description, and its refusals speak Entra's vocabulary. Restating
 *     it here would translate a foreign contract into ours without making it any truer.
 *   - `me/session` (functions/session.ts) — it treats an absent or unreadable body as legitimate
 *     on purpose: a sign-in with nothing to fall back on is the normal case once the claims are
 *     complete. There is nothing to refuse.
 *
 * Ordering, for the routes that do validate: **authenticate, then authorise, then validate.**
 * `withAuthorization` runs first so an anonymous caller never learns the shape of a body they may
 * not submit, and so a caller who may not write gets the identical 403 whether their body was
 * well-formed or not — the same reason `forbidden`'s message names nothing. Validation is the
 * handler's first line rather than a third wrapper, because the schema depends on the verb as
 * well as the route, and the path parameter is checked in the same pass.
 */
export type Parsed<T> = { ok: true; value: T } | { ok: false; response: HttpResponseInit }

/**
 * The validator's issues, narrowed to what a log may carry.
 *
 * Some issue variants hold the offending input. Mapping explicitly, rather than passing the
 * issues through, is what keeps a rejected password or email address out of Application Insights
 * — and it cannot regress silently, because anything added to the issue shape upstream simply is
 * not copied here.
 */
function describeIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    code: issue.code,
  }))
}

/**
 * Reads and validates a JSON body, or produces the refusal to return as-is.
 *
 * An unparseable body is refused with the same code as an ill-shaped one: to the caller both mean
 * "send something else", and splitting them would only add a branch nobody acts on differently.
 */
export async function parseBody<S extends z.ZodType>(
  request: HttpRequest,
  context: InvocationContext,
  schema: S,
): Promise<Parsed<z.infer<S>>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return {
      ok: false,
      response: invalidBody(context, request, [{ path: '(root)', code: 'invalid_json' }]),
    }
  }

  const result = schema.safeParse(body)
  if (!result.success) {
    return { ok: false, response: invalidBody(context, request, describeIssues(result.error)) }
  }

  return { ok: true, value: result.data as z.infer<S> }
}

/**
 * `z.guid()` and deliberately not `z.uuid()`.
 *
 * `UNIQUEIDENTIFIER` holds any 128 bits, and this repository's own reference data is full of
 * identifiers that are not RFC 4122 — `C1C1C1C1-0000-0000-0000-000000000001` carries `0` where
 * the version nibble belongs. `z.uuid()` refuses every one of them, which would answer 400 on
 * every seeded community. `z.guid()` accepts the hexadecimal form and nothing else, which is
 * exactly what the column accepts.
 */
const GUID = z.guid()

/**
 * A route parameter that has to be an identifier, refused before it reaches a query.
 *
 * These are this repository's first routes with a path parameter. Left unchecked, a malformed
 * identifier surfaces as an mssql driver error and a 500, which reads as an outage rather than as
 * a bad link.
 *
 * It is also the answer to #166's "a slug that looks like an identifier": **the API only ever
 * accepts a GUID.** The slug addresses a backoffice screen, and the backoffice resolves it
 * against the list it already holds — the two forms never meet on the wire, so nothing has to
 * choose between them.
 */
export function guidParam(
  request: HttpRequest,
  context: InvocationContext,
  parameter: string,
): Parsed<string> {
  const result = GUID.safeParse(request.params[parameter])
  if (!result.success) {
    return { ok: false, response: invalidRouteParameter(context, request, parameter) }
  }
  return { ok: true, value: result.data }
}

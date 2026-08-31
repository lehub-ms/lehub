import { z } from 'zod'

/**
 * The bodies and query strings the event routes accept.
 *
 * Same construction as `referenceSchemas.ts`, and for the same reason: the schema is what
 * validates *and* what describes. Every one carries a `.meta()` so Feature #170 emits its
 * named `$defs` and their prose from this very object rather than from a second description
 * written by hand beside it, and `api/test/openapiDerivation.test.ts` fails the day one of
 * them stops being describable.
 *
 * Bounds mirror the columns behind them — `Title NVARCHAR(300)` (migration 0001). `Description`
 * is `NVARCHAR(MAX)` and therefore carries no bound here either: the honest mirror of an
 * unbounded column is an unbounded field, and what actually caps a body is the Functions host's
 * own request ceiling, not a number invented in this file.
 */

/**
 * `z.guid()` and deliberately not `z.uuid()` — the same choice `validation.ts` explains at
 * length: this repository's reference data holds identifiers that are not RFC 4122, and
 * `z.uuid()` would answer 400 on every seeded community.
 */
const id = z.guid()

/**
 * The query string of `GET /api/manage/events`.
 *
 * A required parameter and not an optional one: the backoffice always looks at one community's
 * events, because the sidebar always designates one. "Every event I may touch" is a different
 * screen, and inventing it here would publish a listing nothing asks for.
 *
 * `strictObject`, as everywhere else: `?communityid=…` is refused with `unrecognized_keys` in
 * the log rather than silently read as "the parameter is missing", which is the difference
 * between a diagnosable 400 and a puzzling one.
 */
export const EVENT_LIST_QUERY = z
  .strictObject({
    communityId: id,
  })
  .meta({
    id: 'EventListQuery',
    title: 'Filtre de la liste des évènements',
    description: 'La chaîne de requête attendue par GET /api/manage/events.',
  })

/**
 * Enumerated so the derivation test covers every schema by construction. A schema added to this
 * module and forgotten here is the failure this guards against, so adding to this array is part
 * of adding a schema — exactly as `REFERENCE_SCHEMAS` states it.
 */
export const EVENT_SCHEMAS = [EVENT_LIST_QUERY] as const

export type EventListQuery = z.infer<typeof EVENT_LIST_QUERY>

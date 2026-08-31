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

/** Trimmed before it is measured, like every other name in this API: spaces are not a title. */
const title = z.string().trim().min(1).max(300)

/**
 * `Description NVARCHAR(MAX)`, so no bound — see the header. Trimmed, and an empty description
 * collapses to `null` rather than to `''`: two ways of saying "none" would both reach the column
 * and the screen would have to test for both for ever.
 */
const description = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))

/** A blob path inside the media container, never a URL — see lib/mediaUrls. */
const bannerImagePath = z.string().trim().min(1).max(500)

/**
 * An instant, always with its offset, always produced by `Date#toISOString`.
 *
 * The screen collects wall-clock time in `Europe/Paris` and converts before sending; the wire
 * only ever carries instants. A naive `2026-09-10T18:30` would be ambiguous — the API has no way
 * to know which zone a caller meant, and guessing UTC would silently shift every French event by
 * two hours in summer.
 */
const instant = z.iso.datetime({ offset: true })

/**
 * A set of identifiers, in a body.
 *
 * Duplicates are tolerated here and removed by the repository rather than refused: the
 * composite primary keys of `EventCommunity` and `EventTechnology` would reject the second row,
 * and answering "your list has a repeat" to a form that simply sent one twice would be a
 * refusal nobody can act on.
 */
const ids = z.array(id)

/**
 * Creating an event.
 *
 * **The end date is required**, like the start date. It was optional in the first draft of
 * #145; making it mandatory is what lets #174 decide "past" from a single field, and what stops
 * lehub.ms from announcing an event whose end nobody knows. `dbo.Event.EndDate` has been
 * `NOT NULL` since migration 0001, so this is the schema catching up with the column rather
 * than the other way round.
 *
 * `communityIds` may be empty, and that is not an oversight: an administrator creating an event
 * with no community produces one only administrators can manage, which `canCreateEvent` allows
 * and `canWriteEvent` then enforces. An organiser cannot — not because of this schema, but
 * because `canCreateEvent` demands one of *their* communities.
 *
 * `format` and `mode` keep the wire's vocabulary: `formatTypeId` is `dbo.FormatType` (the screen
 * calls it « Type ») and `eventModeId` is `dbo.EventMode` (the screen calls it « Format »).
 */
export const CREATE_EVENT = z
  .strictObject({
    title,
    description: description.nullable().default(null),
    startDate: instant,
    endDate: instant,
    formatTypeId: id,
    eventModeId: id,
    bannerImagePath: bannerImagePath.nullable().default(null),
    communityIds: ids.default([]),
    technologyIds: ids.default([]),
  })
  .refine((body) => Date.parse(body.endDate) >= Date.parse(body.startDate), {
    message: 'The end date must not precede the start date.',
    path: ['endDate'],
  })
  .meta({
    id: 'CreateEvent',
    title: 'Création d’un évènement',
    description: 'Le corps attendu par POST /api/manage/events.',
  })

/**
 * Enumerated so the derivation test covers every schema by construction. A schema added to this
 * module and forgotten here is the failure this guards against, so adding to this array is part
 * of adding a schema — exactly as `REFERENCE_SCHEMAS` states it.
 */
export const EVENT_SCHEMAS = [EVENT_LIST_QUERY, CREATE_EVENT] as const

export type EventListQuery = z.infer<typeof EVENT_LIST_QUERY>
export type CreateEventBody = z.infer<typeof CREATE_EVENT>

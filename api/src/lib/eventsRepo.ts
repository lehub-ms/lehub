import sql from 'mssql'
import { getMediaConfig, mediaUrl, type MediaConfig } from './mediaUrls'
import { getPool } from './sqlClient'
import { isForeignKeyViolation } from './sqlErrors'

export interface NamedRef {
  id: string
  name: string
  /**
   * Communities and technologies are treated identically: both carry a logo, and both expose
   * it here, so a caller does not have to fetch /api/communities to render an event's chips.
   */
  logoUrl: string | null
  /**
   * Whether the entry has been archived in the referential (#155).
   *
   * The attachment itself is untouched — an archived community keeps appearing on the events it
   * ran, which is the whole point of archiving rather than deleting. What this carries is the
   * one consequence for a reader: the public site builds its filters from the events it has
   * already fetched, so without this flag an archived entry would go on being offered as a
   * filter for ever. A flag rather than a second endpoint, because there is no public listing
   * of technologies to filter and inventing one would settle a question that belongs to the
   * public-filters feature.
   */
  archived: boolean
}

/** What FOR JSON PATH actually produces. `logoPath` is absent, not null, when there is none. */
interface NamedRefRow {
  id: string
  name: string
  logoPath?: string
  /** `1` or `0`: FOR JSON PATH renders the CASE below as a number, never as a boolean. */
  archived: number
}

export interface EventSummary {
  id: string
  title: string
  description: string | null
  startDate: string
  endDate: string
  bannerImageUrl: string | null
  format: string
  mode: string
  communities: NamedRef[]
  technologies: NamedRef[]
}

interface EventRow {
  Id: string
  Title: string
  Description: string | null
  StartDate: Date
  EndDate: Date
  /** Blob path inside the media container, not a URL — see mediaUrls. */
  BannerImagePath: string | null
  Format: string
  Mode: string
  /** JSON arrays produced by FOR JSON PATH — null when the event has no link. */
  Communities: string | null
  Technologies: string | null
}

/**
 * The two link collections, as JSON rather than a delimited string so a name containing the
 * delimiter cannot corrupt the result.
 *
 * Written once and shared by the public listing and the backoffice one. They are the same
 * attachments seen from two screens — an event's communities and technologies do not change
 * shape because an organiser is the one looking — and the first copy had already been made
 * before this was extracted.
 *
 * Correlated on `e.Id`, so every query embedding this must name the events table `e`.
 */
const ATTACHMENT_COLUMNS = `
  (SELECT c.Id AS id, c.Name AS name, c.LogoPath AS logoPath,
          CASE WHEN c.Status = 'archived' THEN 1 ELSE 0 END AS archived
     FROM dbo.EventCommunity ec
     JOIN dbo.Community c ON c.Id = ec.CommunityId
    WHERE ec.EventId = e.Id
    ORDER BY c.Name
      FOR JSON PATH) AS Communities,
  (SELECT t.Id AS id, t.Name AS name, t.LogoPath AS logoPath,
          CASE WHEN t.Status = 'archived' THEN 1 ELSE 0 END AS archived
     FROM dbo.EventTechnology et
     JOIN dbo.Technology t ON t.Id = et.TechnologyId
    WHERE et.EventId = e.Id
    ORDER BY t.Name
      FOR JSON PATH) AS Technologies
`

/**
 * Upcoming events, soonest first.
 *
 * Filtered on EndDate, not StartDate: issue #18 asks for past events to be excluded,
 * and a two-day conference is not past on its opening morning. Ordering stays on
 * StartDate, which IX_Event_StartDate backs.
 */
const UPCOMING_EVENTS_QUERY = `
SELECT
  e.Id,
  e.Title,
  e.Description,
  e.StartDate,
  e.EndDate,
  e.BannerImagePath,
  ft.Name AS Format,
  em.Name AS Mode,
${ATTACHMENT_COLUMNS}
FROM dbo.Event e
JOIN dbo.FormatType ft ON ft.Id = e.FormatTypeId
JOIN dbo.EventMode  em ON em.Id = e.EventModeId
WHERE e.EndDate > SYSUTCDATETIME()
ORDER BY e.StartDate
`

/**
 * FOR JSON PATH omits a null property rather than emitting it, which is why the row type has
 * `logoPath` optional and why this maps instead of casting straight through. Adding
 * INCLUDE_NULL_VALUES would emit nulls for every column of every ref, not just this one.
 */
function parseRefs(json: string | null, media: MediaConfig): NamedRef[] {
  if (!json) return []
  return (JSON.parse(json) as NamedRefRow[]).map((ref) => ({
    id: ref.id,
    name: ref.name,
    logoUrl: mediaUrl(ref.logoPath, media),
    archived: ref.archived === 1,
  }))
}

export async function listUpcomingEvents(): Promise<EventSummary[]> {
  const media = getMediaConfig()
  const pool = await getPool()
  const result = await pool.request().query<EventRow>(UPCOMING_EVENTS_QUERY)

  return result.recordset.map((row) => ({
    id: row.Id,
    title: row.Title,
    description: row.Description,
    startDate: row.StartDate.toISOString(),
    endDate: row.EndDate.toISOString(),
    bannerImageUrl: mediaUrl(row.BannerImagePath, media),
    format: row.Format,
    mode: row.Mode,
    communities: parseRefs(row.Communities, media),
    technologies: parseRefs(row.Technologies, media),
  }))
}

/**
 * What the backoffice sees of an event, and the public contract deliberately does not.
 *
 * Three things set it apart from `EventSummary`. The **identifiers** of the format type and the
 * event mode travel alongside their names, because the form has to preselect them and an API
 * that only rendered `"Meetup"` would force the browser to match on a label. The **stored path**
 * of the banner travels alongside its URL, for the reason `AdminCommunity` carries `logoPath`:
 * the form sends the path straight back on save, and recomposing it from the URL would put
 * `mediaUrls` in a browser. And past events are **not filtered out** — the whole point of #144
 * is that an organiser corrects what has already happened.
 *
 * `format` is `dbo.FormatType` (Conférence, Meetup, Webinaire…) and `mode` is `dbo.EventMode`
 * (Présentiel, En ligne, Hybride). The backoffice calls the first one « Type » and the second
 * one « Format » — the screen's vocabulary, settled in #145, is not the wire's, and the single
 * place the two are reconciled is `frontend/admin.lehub.ms/src/lib/eventVocabulary.ts`. The wire
 * keeps the names the public contract already published.
 */
export interface AdminEvent {
  id: string
  title: string
  description: string | null
  startDate: string
  endDate: string
  bannerImagePath: string | null
  bannerImageUrl: string | null
  formatTypeId: string
  format: string
  eventModeId: string
  mode: string
  communities: NamedRef[]
  technologies: NamedRef[]
}

interface AdminEventRow extends EventRow {
  FormatTypeId: string
  EventModeId: string
}

/**
 * The columns the backoffice reads of an event. Shared by the listing and the single-row read so
 * the two projections cannot drift into answering different shapes for the same object.
 *
 * Names the events table `e`, which `ATTACHMENT_COLUMNS` correlates on.
 */
const ADMIN_EVENT_COLUMNS = `
  e.Id,
  e.Title,
  e.Description,
  e.StartDate,
  e.EndDate,
  e.BannerImagePath,
  e.FormatTypeId,
  ft.Name AS Format,
  e.EventModeId,
  em.Name AS Mode,
${ATTACHMENT_COLUMNS}
FROM dbo.Event e
JOIN dbo.FormatType ft ON ft.Id = e.FormatTypeId
JOIN dbo.EventMode  em ON em.Id = e.EventModeId
`

/**
 * Every event carrying a given community, soonest first.
 *
 * `EXISTS` rather than a join to `EventCommunity`: an event carried by that community *and* by
 * another one must appear once, and a join would emit it once per matching link row. It is an
 * index seek on `IX_EventCommunity_CommunityId` (migration 0001).
 *
 * No filter on `EndDate`, unlike the public listing. Past events belong in this list — #174
 * folds them behind a group row on the screen, which is a rendering decision and stays one:
 * filtering them out here would make « la recherche traverse le repli » impossible to honour.
 */
export const LIST_COMMUNITY_EVENTS_QUERY = `
SELECT
${ADMIN_EVENT_COLUMNS}
WHERE EXISTS (SELECT 1 FROM dbo.EventCommunity ec
               WHERE ec.EventId = e.Id AND ec.CommunityId = @communityId)
ORDER BY e.StartDate
`

/** The same projection, for one event. Appended to a write so the caller gets the row back in
    the same round-trip rather than reading it again. */
const SELECT_ADMIN_EVENT = `
SELECT
${ADMIN_EVENT_COLUMNS}
WHERE e.Id = @id
`

/** Exported for its own sake: the mapping is the testable half, the query is not. */
export function mapAdminEvent(media: MediaConfig) {
  return (row: AdminEventRow): AdminEvent => ({
    id: row.Id,
    title: row.Title,
    description: row.Description,
    startDate: row.StartDate.toISOString(),
    endDate: row.EndDate.toISOString(),
    bannerImagePath: row.BannerImagePath,
    bannerImageUrl: mediaUrl(row.BannerImagePath, media),
    formatTypeId: row.FormatTypeId,
    format: row.Format,
    eventModeId: row.EventModeId,
    mode: row.Mode,
    communities: parseRefs(row.Communities, media),
    technologies: parseRefs(row.Technologies, media),
  })
}

export async function listCommunityEvents(communityId: string): Promise<AdminEvent[]> {
  const media = getMediaConfig()
  const pool = await getPool()
  const result = await pool
    .request()
    .input('communityId', sql.UniqueIdentifier, communityId)
    .query<AdminEventRow>(LIST_COMMUNITY_EVENTS_QUERY)

  return result.recordset.map(mapAdminEvent(media))
}

/**
 * One event, in the administration projection, or `null`.
 *
 * `null` and not a throw: an identifier that matches nothing is a shared link to an event since
 * deleted, which is an ordinary outcome the screen has a sentence for (#146), not a failure.
 */
export async function getAdminEvent(id: string): Promise<AdminEvent | null> {
  const media = getMediaConfig()
  const pool = await getPool()
  const result = await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query<AdminEventRow>(SELECT_ADMIN_EVENT)

  const row = result.recordset[0]
  return row ? mapAdminEvent(media)(row) : null
}

/**
 * The two closed vocabularies an event is qualified by.
 *
 * They are lookup tables their owner edits in the database, not a referential the backoffice
 * manages — #150 covers communities and technologies and deliberately stops there. So this is a
 * read and nothing else, and it is anonymous for the same reason `communities` is: the form of
 * an organiser who is not a global administrator needs them, and there is no secret in the word
 * "Meetup".
 *
 * `ORDER BY Name`, which is deterministic and needs no schema change. It is not the curated
 * order of the seed — alphabetically, « Autre » lands second among the six types rather than
 * last — and a curated order would take a sort column on both tables, hence a migration. Noted
 * rather than papered over with a hard-coded list of names in the query.
 *
 * Two result sets in one round-trip: they are always read together, by one screen.
 */
export const LIST_EVENT_OPTIONS_QUERY = `
SELECT Id, Name FROM dbo.FormatType ORDER BY Name;
SELECT Id, Name FROM dbo.EventMode  ORDER BY Name;
`

/** One entry of a closed vocabulary: an identifier to send back, a name to show. */
export interface EventOption {
  id: string
  name: string
}

export interface EventOptions {
  /** `dbo.FormatType` — the screen calls it « Type ». */
  formats: EventOption[]
  /** `dbo.EventMode` — the screen calls it « Format ». */
  modes: EventOption[]
}

interface OptionRow {
  Id: string
  Name: string
}

/** Split out so the two-recordset shape can be exercised without a database. */
export function mapEventOptions(recordsets: readonly (readonly OptionRow[])[]): EventOptions {
  const asOptions = (rows: readonly OptionRow[] = []): EventOption[] =>
    rows.map((row) => ({ id: row.Id, name: row.Name }))

  return { formats: asOptions(recordsets[0]), modes: asOptions(recordsets[1]) }
}

export async function listEventOptions(): Promise<EventOptions> {
  const pool = await getPool()
  const result = await pool.request().query<OptionRow>(LIST_EVENT_OPTIONS_QUERY)

  return mapEventOptions(result.recordsets as unknown as OptionRow[][])
}

/**
 * What a write to an event can answer.
 *
 * A discriminated result and never a throw, like `CommunityWriteResult`: an unknown community in
 * the body is a legitimate outcome the screen has something to say about, not an exception to
 * work around.
 *
 * `unknown-reference` covers a format, a mode, a community or a technology the database does not
 * hold — all four are foreign keys, all four produce error 547, and SQL Server does not make it
 * worth telling them apart for a message the caller acts on identically: send something else.
 */
export type EventWriteResult =
  | { ok: true; event: AdminEvent }
  | { ok: false; error: 'unknown-reference' }
  | { ok: false; error: 'not-found' }

export interface CreateEventInput {
  title: string
  description: string | null
  startDate: string
  endDate: string
  formatTypeId: string
  eventModeId: string
  bannerImagePath: string | null
  communityIds: readonly string[]
  technologyIds: readonly string[]
}

/**
 * Creates the event and both sets of links, or nothing at all.
 *
 * `SET XACT_ABORT ON` with an explicit transaction, which is the one place in this repository
 * that needs one: three tables have to move together, and an event that landed without its
 * communities would be an event nobody but an administrator could reopen — precisely the state
 * #147 forbids anyone from producing.
 *
 * The identifier lists travel as a **JSON parameter** read by `OPENJSON`, never concatenated
 * into the statement. `DISTINCT` because the composite primary keys would refuse a repeated
 * pair, and a caller that sent the same community twice has made a harmless mistake, not a
 * request to refuse.
 *
 * `SET XACT_ABORT` is a **connection** setting, not a batch one, and these run on a pooled
 * connection — left on, it would follow that connection into every later request that borrows
 * it. So it is closed again after the commit. A batch that aborts never reaches that line and
 * does leave it on; that residue is accepted rather than papered over, because `ON` is the
 * conservative direction — it aborts a batch on error instead of carrying on — and no query in
 * this repository depends on `OFF`. Closing it properly on both paths would mean a driver-managed
 * transaction (`pool.transaction()`) rather than a hand-rolled one, which is a change worth
 * making against a real database and not blind.
 */
export const CREATE_EVENT_QUERY = `
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @created TABLE (Id UNIQUEIDENTIFIER);

INSERT INTO dbo.Event (Title, Description, StartDate, EndDate, FormatTypeId, EventModeId, BannerImagePath)
OUTPUT inserted.Id INTO @created
VALUES (@title, @description, @startDate, @endDate, @formatTypeId, @eventModeId, @bannerImagePath);

DECLARE @id UNIQUEIDENTIFIER = (SELECT TOP 1 Id FROM @created);

INSERT INTO dbo.EventCommunity (EventId, CommunityId)
SELECT DISTINCT @id, value FROM OPENJSON(@communityIds) WITH (value UNIQUEIDENTIFIER '$');

INSERT INTO dbo.EventTechnology (EventId, TechnologyId)
SELECT DISTINCT @id, value FROM OPENJSON(@technologyIds) WITH (value UNIQUEIDENTIFIER '$');

COMMIT TRANSACTION;
SET XACT_ABORT OFF;
${SELECT_ADMIN_EVENT}
`

export async function createEvent(input: CreateEventInput): Promise<EventWriteResult> {
  const media = getMediaConfig()
  const pool = await getPool()

  let rows: AdminEventRow[]
  try {
    const result = await pool
      .request()
      .input('title', sql.NVarChar(300), input.title)
      .input('description', sql.NVarChar(sql.MAX), input.description)
      // `DateTime2` and an ISO string with its offset: the driver parses it to the instant it
      // denotes, so nothing here has to know about Europe/Paris.
      .input('startDate', sql.DateTime2, new Date(input.startDate))
      .input('endDate', sql.DateTime2, new Date(input.endDate))
      .input('formatTypeId', sql.UniqueIdentifier, input.formatTypeId)
      .input('eventModeId', sql.UniqueIdentifier, input.eventModeId)
      .input('bannerImagePath', sql.NVarChar(500), input.bannerImagePath)
      .input('communityIds', sql.NVarChar(sql.MAX), JSON.stringify(input.communityIds))
      .input('technologyIds', sql.NVarChar(sql.MAX), JSON.stringify(input.technologyIds))
      .query<AdminEventRow>(CREATE_EVENT_QUERY)
    rows = result.recordset
  } catch (error) {
    // 547: one of the four foreign keys does not resolve. The row was never written — the
    // transaction saw to that — so this is a refusal and not a partial state.
    if (isForeignKeyViolation(error)) return { ok: false, error: 'unknown-reference' }
    throw error
  }

  const row = rows[0]
  if (!row) return { ok: false, error: 'not-found' }
  return { ok: true, event: mapAdminEvent(media)(row) }
}

/**
 * Deletes an event and, with it, its attachments.
 *
 * Nothing cascades by hand: `FK_EventCommunity_Event` and `FK_EventTechnology_Event` both carry
 * `ON DELETE CASCADE` since migration 0001, so the links go with the row and the referentials are
 * untouched — which is exactly what #149 asks for, and what the schema was already shaped to do.
 *
 * **The banner blob stays.** It is the same decision `mediaUpload` documents for orphans and for
 * the same reasons: a stray blob costs fractions of a cent a month against the 25 €/month design
 * cap, the account keeps seven days of soft delete, and the container is `publicAccess: 'Blob'`
 * so an unreferenced blob is unreachable without its exact generated name and is listed to
 * nobody. Deleting it here would also be wrong in one real case — two events sharing a path,
 * which nothing forbids. A sweep is a background job with an inventory, not a line in a DELETE.
 *
 * `@@ROWCOUNT` distinguishes "deleted" from "was not there", which is what lets the screen answer
 * an event already removed from another tab with a sentence rather than with silence.
 */
export const DELETE_EVENT_QUERY = `
DELETE FROM dbo.Event WHERE Id = @id;
SELECT @@ROWCOUNT AS DeletedRows;
`

export type DeleteEventResult = { ok: true } | { ok: false; error: 'not-found' }

export async function deleteEvent(id: string): Promise<DeleteEventResult> {
  const pool = await getPool()
  const result = await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query<{ DeletedRows: number }>(DELETE_EVENT_QUERY)

  return (result.recordset[0]?.DeletedRows ?? 0) > 0 ? { ok: true } : { ok: false, error: 'not-found' }
}

/**
 * A PATCH: a key that is absent is a field left alone, which is not the same as one explicitly
 * set to null.
 *
 * Spelled out rather than `Partial<>` because of `exactOptionalPropertyTypes`, which refuses an
 * explicit `undefined` under `Partial<T>` — and an explicit `undefined` is exactly what a
 * validated body hands over for a key the caller omitted. Same shape as `UpdateCommunityInput`.
 */
export type UpdateEventInput = {
  [K in keyof CreateEventInput]?: CreateEventInput[K] | undefined
}

/**
 * Replaces one set of links, without churning the rows that do not change.
 *
 * `NOT IN` then `NOT EXISTS` rather than "delete everything and reinsert": a blanket delete would
 * rewrite every unchanged pair, and — more to the point — would briefly leave the event with no
 * community at all inside the transaction, which is the exact state #147 spends three rules
 * forbidding. Nothing outside would see it, but a statement that produces a forbidden state and
 * relies on isolation to hide it is one refactor away from being wrong.
 *
 * Guarded by `IS NOT NULL` because an absent list means "leave these links alone", which is not
 * the same as an empty list meaning "remove them all".
 *
 * Guarded by the event's existence too, and that one is not belt-and-braces. An event deleted
 * from another tab while this one was editing it must answer "this event is gone" — but the
 * insert would hit `FK_EventCommunity_Event` first and answer "something you referenced does not
 * exist", which is true of the event and useless to the person reading it. Skipping the links
 * lets the trailing SELECT come back empty, which is what `not-found` is read from.
 */
function replaceLinks(table: string, column: string, parameter: string): string {
  return `
IF @${parameter} IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.Event WHERE Id = @id)
BEGIN
  DELETE FROM dbo.${table}
   WHERE EventId = @id
     AND ${column} NOT IN (SELECT value FROM OPENJSON(@${parameter}) WITH (value UNIQUEIDENTIFIER '$'));

  INSERT INTO dbo.${table} (EventId, ${column})
  SELECT DISTINCT @id, j.value
    FROM OPENJSON(@${parameter}) WITH (value UNIQUEIDENTIFIER '$') AS j
   WHERE NOT EXISTS (SELECT 1 FROM dbo.${table} AS existing
                      WHERE existing.EventId = @id AND existing.${column} = j.value);
END
`
}

/**
 * The columns a PATCH may touch, and the only place a request key becomes a column name.
 *
 * The SET clause is assembled from the keys actually present. `COALESCE` cannot serve: `null` is
 * a meaningful value for a description or a banner, and would be indistinguishable from
 * "absent". Only keys of this record ever reach the statement, and every value stays a typed
 * parameter, so nothing a caller sends is concatenated into SQL. Same construction as
 * `UPDATABLE_COLUMNS` in `communitiesRepo`.
 */
const UPDATABLE_EVENT_COLUMNS = {
  title: { column: 'Title', type: sql.NVarChar(300) },
  description: { column: 'Description', type: sql.NVarChar(sql.MAX) },
  startDate: { column: 'StartDate', type: sql.DateTime2 },
  endDate: { column: 'EndDate', type: sql.DateTime2 },
  formatTypeId: { column: 'FormatTypeId', type: sql.UniqueIdentifier },
  eventModeId: { column: 'EventModeId', type: sql.UniqueIdentifier },
  bannerImagePath: { column: 'BannerImagePath', type: sql.NVarChar(500) },
} as const

/** The two date columns take an instant, not the ISO string the wire carries. */
function columnValue(key: string, value: string | null): string | Date | null {
  if (value === null) return null
  return key === 'startDate' || key === 'endDate' ? new Date(value) : value
}

export async function updateEvent(
  id: string,
  patch: UpdateEventInput,
): Promise<EventWriteResult> {
  const media = getMediaConfig()
  const pool = await getPool()

  const request = pool.request().input('id', sql.UniqueIdentifier, id)
  const assignments: string[] = []

  for (const [key, spec] of Object.entries(UPDATABLE_EVENT_COLUMNS)) {
    const value = patch[key as keyof typeof UPDATABLE_EVENT_COLUMNS]
    if (value === undefined) continue
    assignments.push(`${spec.column} = @${key}`)
    request.input(key, spec.type, columnValue(key, value))
  }

  // Always declared, `null` when absent: the statement below names them, and `null` is what
  // makes its `IS NOT NULL` guard mean "leave these links alone".
  request.input(
    'communityIds',
    sql.NVarChar(sql.MAX),
    patch.communityIds ? JSON.stringify(patch.communityIds) : null,
  )
  request.input(
    'technologyIds',
    sql.NVarChar(sql.MAX),
    patch.technologyIds ? JSON.stringify(patch.technologyIds) : null,
  )

  // The schema already refuses an empty patch; this keeps the statement valid if that ever
  // changes, and answers the read rather than a syntax error.
  const update =
    assignments.length > 0 ? `UPDATE dbo.Event SET ${assignments.join(', ')} WHERE Id = @id;` : ''

  // One transaction, like the creation: the columns and both sets of links move together or not
  // at all. An event whose communities were replaced but whose title was not would be a state no
  // caller asked for.
  const statement = `
SET XACT_ABORT ON;
BEGIN TRANSACTION;
${update}
${replaceLinks('EventCommunity', 'CommunityId', 'communityIds')}
${replaceLinks('EventTechnology', 'TechnologyId', 'technologyIds')}
COMMIT TRANSACTION;
SET XACT_ABORT OFF;
${SELECT_ADMIN_EVENT}
`

  let rows: AdminEventRow[]
  try {
    const result = await request.query<AdminEventRow>(statement)
    rows = result.recordset
  } catch (error) {
    if (isForeignKeyViolation(error)) return { ok: false, error: 'unknown-reference' }
    throw error
  }

  const row = rows[0]
  // No row after the write means the event is gone — deleted from another tab while this one
  // was editing it, which #146 asks be answered explicitly rather than by recreating it.
  if (!row) return { ok: false, error: 'not-found' }
  return { ok: true, event: mapAdminEvent(media)(row) }
}

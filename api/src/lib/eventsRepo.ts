import sql from 'mssql'
import { getMediaConfig, mediaUrl, type MediaConfig } from './mediaUrls'
import { getPool } from './sqlClient'

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
WHERE EXISTS (SELECT 1 FROM dbo.EventCommunity ec
               WHERE ec.EventId = e.Id AND ec.CommunityId = @communityId)
ORDER BY e.StartDate
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

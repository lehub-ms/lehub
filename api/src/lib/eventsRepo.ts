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
}

/** What FOR JSON PATH actually produces. `logoPath` is absent, not null, when there is none. */
interface NamedRefRow {
  id: string
  name: string
  logoPath?: string
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
 * Upcoming events, soonest first.
 *
 * Filtered on EndDate, not StartDate: issue #18 asks for past events to be excluded,
 * and a two-day conference is not past on its opening morning. Ordering stays on
 * StartDate, which IX_Event_StartDate backs.
 *
 * The two link collections come back as JSON rather than a delimited string so a
 * name containing the delimiter cannot corrupt the result.
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
  (SELECT c.Id AS id, c.Name AS name, c.LogoPath AS logoPath
     FROM dbo.EventCommunity ec
     JOIN dbo.Community c ON c.Id = ec.CommunityId
    WHERE ec.EventId = e.Id
    ORDER BY c.Name
      FOR JSON PATH) AS Communities,
  (SELECT t.Id AS id, t.Name AS name, t.LogoPath AS logoPath
     FROM dbo.EventTechnology et
     JOIN dbo.Technology t ON t.Id = et.TechnologyId
    WHERE et.EventId = e.Id
    ORDER BY t.Name
      FOR JSON PATH) AS Technologies
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

import { getPool } from './sqlClient'

export interface NamedRef {
  id: string
  name: string
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
  BannerImageUrl: string | null
  Format: string
  Mode: string
  /** JSON arrays produced by FOR JSON PATH — null when the event has no link. */
  Communities: string | null
  Technologies: string | null
}

/**
 * Upcoming events, soonest first.
 *
 * The two link collections come back as JSON rather than a delimited string so a
 * name containing the delimiter cannot corrupt the result. IX_Event_StartDate backs
 * the filter and the ordering.
 */
const UPCOMING_EVENTS_QUERY = `
SELECT
  e.Id,
  e.Title,
  e.Description,
  e.StartDate,
  e.EndDate,
  e.BannerImageUrl,
  ft.Name AS Format,
  em.Name AS Mode,
  (SELECT c.Id AS id, c.Name AS name
     FROM dbo.EventCommunity ec
     JOIN dbo.Community c ON c.Id = ec.CommunityId
    WHERE ec.EventId = e.Id
    ORDER BY c.Name
      FOR JSON PATH) AS Communities,
  (SELECT t.Id AS id, t.Name AS name
     FROM dbo.EventTechnology et
     JOIN dbo.Technology t ON t.Id = et.TechnologyId
    WHERE et.EventId = e.Id
    ORDER BY t.Name
      FOR JSON PATH) AS Technologies
FROM dbo.Event e
JOIN dbo.FormatType ft ON ft.Id = e.FormatTypeId
JOIN dbo.EventMode  em ON em.Id = e.EventModeId
WHERE e.StartDate > SYSUTCDATETIME()
ORDER BY e.StartDate
`

function parseRefs(json: string | null): NamedRef[] {
  if (!json) return []
  return JSON.parse(json) as NamedRef[]
}

export async function listUpcomingEvents(): Promise<EventSummary[]> {
  const pool = await getPool()
  const result = await pool.request().query<EventRow>(UPCOMING_EVENTS_QUERY)

  return result.recordset.map((row) => ({
    id: row.Id,
    title: row.Title,
    description: row.Description,
    startDate: row.StartDate.toISOString(),
    endDate: row.EndDate.toISOString(),
    bannerImageUrl: row.BannerImageUrl,
    format: row.Format,
    mode: row.Mode,
    communities: parseRefs(row.Communities),
    technologies: parseRefs(row.Technologies),
  }))
}

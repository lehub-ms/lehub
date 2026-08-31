import { getMediaConfig, mediaUrl, type MediaConfig } from './mediaUrls'
import { getPool } from './sqlClient'

export interface CommunitySummary {
  id: string
  name: string
  logoUrl: string | null
  description: string | null
}

/**
 * What the backoffice sees, and the public contract deliberately does not.
 *
 * Three things set it apart from `CommunitySummary`: the status, because an administrator has to
 * see what is archived in order to reactivate it; the two counts, which is what decides whether
 * deletion may even be offered (#155); and `logoPath` alongside `logoUrl`, because the edit panel
 * sends the stored path straight back on save and composing it back from the URL would mean a
 * second copy of `mediaUrls` living in a browser.
 */
export interface AdminCommunity extends CommunitySummary {
  logoPath: string | null
  status: ReferenceStatus
  /** Designations in force, which is what Story #151 puts in the Organisateurs column. */
  organizerCount: number
  /** Events holding this community. Zero is what makes permanent deletion possible at all. */
  eventCount: number
}

export type ReferenceStatus = 'active' | 'archived'

interface CommunityRow {
  Id: string
  Name: string
  /** Blob path inside the media container, not a URL — see mediaUrls. */
  LogoPath: string | null
  Description: string | null
}

interface AdminCommunityRow extends CommunityRow {
  Status: ReferenceStatus
  OrganizerCount: number
  EventCount: number
}

/**
 * All *active* communities, alphabetical. This is just a deterministic API order — the random,
 * session-stable order Story #15 asks for is drawn client-side, so this endpoint stays
 * a plain cacheable list rather than reshuffling on every request.
 *
 * The status filter is the public half of Story #155: an archived community disappears from what
 * is offered — the carousel, the filters, an event's attachments — while every attachment it
 * already carries stands. Which is why the filter lives here and *not* in the events payload: a
 * past event keeps showing the community that ran it.
 */
export const LIST_COMMUNITIES_QUERY = `
SELECT Id, Name, LogoPath, Description
FROM dbo.Community
WHERE Status = 'active'
ORDER BY Name
`

/**
 * Every community, archived ones included, with what the administration screen needs.
 *
 * Correlated subqueries rather than two `LEFT JOIN … GROUP BY`: joining both join tables at once
 * would multiply their rows against each other and make each count the product of the two. They
 * are index seeks — `IX_EventCommunity_CommunityId` (0001) and `PK_CommunityOrganizer`, whose
 * leading column is `CommunityId` (0005) — on a table that holds tens of rows.
 */
export const LIST_ADMIN_COMMUNITIES_QUERY = `
SELECT
  c.Id,
  c.Name,
  c.LogoPath,
  c.Description,
  c.Status,
  (SELECT COUNT(*) FROM dbo.CommunityOrganizer co WHERE co.CommunityId = c.Id) AS OrganizerCount,
  (SELECT COUNT(*) FROM dbo.EventCommunity     ec WHERE ec.CommunityId = c.Id) AS EventCount
FROM dbo.Community AS c
ORDER BY c.Name
`

export async function listCommunities(): Promise<CommunitySummary[]> {
  const media = getMediaConfig()
  const pool = await getPool()
  const result = await pool.request().query<CommunityRow>(LIST_COMMUNITIES_QUERY)

  return result.recordset.map((row) => ({
    id: row.Id,
    name: row.Name,
    logoUrl: mediaUrl(row.LogoPath, media),
    description: row.Description,
  }))
}

export async function listAdminCommunities(): Promise<AdminCommunity[]> {
  const media = getMediaConfig()
  const pool = await getPool()
  const result = await pool.request().query<AdminCommunityRow>(LIST_ADMIN_COMMUNITIES_QUERY)

  return result.recordset.map(mapAdminCommunity(media))
}

/** Exported for its own sake: the mapping is the testable half, the query is not. */
export function mapAdminCommunity(media: MediaConfig) {
  return (row: AdminCommunityRow): AdminCommunity => ({
    id: row.Id,
    name: row.Name,
    logoPath: row.LogoPath,
    logoUrl: mediaUrl(row.LogoPath, media),
    description: row.Description,
    status: row.Status,
    organizerCount: row.OrganizerCount,
    eventCount: row.EventCount,
  })
}

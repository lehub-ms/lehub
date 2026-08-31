import { getMediaConfig, mediaUrl, type MediaConfig } from './mediaUrls'
import { getPool } from './sqlClient'
import { type ReferenceStatus } from './communitiesRepo'

/**
 * The technology referential.
 *
 * There has never been a repository for it: technologies reached clients only nested inside an
 * event, as the `NamedRef`s that `eventsRepo` builds with FOR JSON PATH. The backoffice is the
 * first caller that needs them as themselves.
 *
 * A technology carries no description — it labels an event, it is not a profile. Story #153 says
 * so, and the absence is the specification rather than a column nobody got round to adding.
 */
export interface AdminTechnology {
  id: string
  name: string
  /** Blob path inside the media container, not a URL — see mediaUrls. */
  logoPath: string | null
  logoUrl: string | null
  status: ReferenceStatus
  /** Events holding this technology. Zero is what makes permanent deletion possible at all. */
  eventCount: number
}

interface AdminTechnologyRow {
  Id: string
  Name: string
  LogoPath: string | null
  Status: ReferenceStatus
  EventCount: number
}

/**
 * Every technology, archived ones included. Same shape as the community listing, and the same
 * reason for the correlated subquery: it is an index seek on `IX_EventTechnology_TechnologyId`.
 */
export const LIST_ADMIN_TECHNOLOGIES_QUERY = `
SELECT
  t.Id,
  t.Name,
  t.LogoPath,
  t.Status,
  (SELECT COUNT(*) FROM dbo.EventTechnology et WHERE et.TechnologyId = t.Id) AS EventCount
FROM dbo.Technology AS t
ORDER BY t.Name
`

export async function listAdminTechnologies(): Promise<AdminTechnology[]> {
  const media = getMediaConfig()
  const pool = await getPool()
  const result = await pool.request().query<AdminTechnologyRow>(LIST_ADMIN_TECHNOLOGIES_QUERY)

  return result.recordset.map(mapAdminTechnology(media))
}

/** Exported for its own sake: the mapping is the testable half, the query is not. */
export function mapAdminTechnology(media: MediaConfig) {
  return (row: AdminTechnologyRow): AdminTechnology => ({
    id: row.Id,
    name: row.Name,
    logoPath: row.LogoPath,
    logoUrl: mediaUrl(row.LogoPath, media),
    status: row.Status,
    eventCount: row.EventCount,
  })
}

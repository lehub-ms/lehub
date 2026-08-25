import { getMediaConfig, mediaUrl } from './mediaUrls'
import { getPool } from './sqlClient'

export interface CommunitySummary {
  id: string
  name: string
  logoUrl: string | null
  description: string | null
}

interface CommunityRow {
  Id: string
  Name: string
  /** Blob path inside the media container, not a URL — see mediaUrls. */
  LogoPath: string | null
  Description: string | null
}

/**
 * All communities, alphabetical. This is just a deterministic API order — the random,
 * session-stable order Story #15 asks for is drawn client-side, so this endpoint stays
 * a plain cacheable list rather than reshuffling on every request.
 */
const LIST_COMMUNITIES_QUERY = `
SELECT Id, Name, LogoPath, Description
FROM dbo.Community
ORDER BY Name
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

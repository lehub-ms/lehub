import { getMediaConfig, mediaUrl, type MediaConfig } from './mediaUrls'
import sql from 'mssql'
import { getPool } from './sqlClient'
import { isForeignKeyViolation, isUniqueViolation } from './sqlErrors'
import { type DeleteResult, type ReferenceStatus } from './communitiesRepo'

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

/** Same construction as the community side: a refusal is a result, never a throw. */
export type TechnologyWriteResult =
  | { ok: true; technology: AdminTechnology }
  | { ok: false; error: 'name-taken' }
  | { ok: false; error: 'not-found' }

export interface CreateTechnologyInput {
  name: string
  logoPath: string | null
  status: ReferenceStatus
}

export type UpdateTechnologyInput = {
  [K in keyof CreateTechnologyInput]?: CreateTechnologyInput[K] | undefined
}

const SELECT_ADMIN_TECHNOLOGY = `
SELECT
  t.Id,
  t.Name,
  t.LogoPath,
  t.Status,
  (SELECT COUNT(*) FROM dbo.EventTechnology et WHERE et.TechnologyId = t.Id) AS EventCount
FROM dbo.Technology AS t
WHERE t.Id = @id
`

export const CREATE_TECHNOLOGY_QUERY = `
DECLARE @created TABLE (Id UNIQUEIDENTIFIER);

INSERT INTO dbo.Technology (Name, LogoPath, Status)
OUTPUT inserted.Id INTO @created
VALUES (@name, @logoPath, @status);

DECLARE @id UNIQUEIDENTIFIER = (SELECT TOP 1 Id FROM @created);
${SELECT_ADMIN_TECHNOLOGY}
`

export async function createTechnology(
  input: CreateTechnologyInput,
): Promise<TechnologyWriteResult> {
  const media = getMediaConfig()
  const pool = await getPool()

  let rows: AdminTechnologyRow[]
  try {
    const result = await pool
      .request()
      .input('name', sql.NVarChar(200), input.name)
      .input('logoPath', sql.NVarChar(500), input.logoPath)
      .input('status', sql.NVarChar(20), input.status)
      .query<AdminTechnologyRow>(CREATE_TECHNOLOGY_QUERY)
    rows = result.recordset
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'name-taken' }
    throw error
  }

  const row = rows[0]
  if (!row) return { ok: false, error: 'not-found' }
  return { ok: true, technology: mapAdminTechnology(media)(row) }
}

/** The only place a request key becomes a column name. See the community repository. */
const UPDATABLE_COLUMNS = {
  name: { column: 'Name', type: sql.NVarChar(200) },
  logoPath: { column: 'LogoPath', type: sql.NVarChar(500) },
  status: { column: 'Status', type: sql.NVarChar(20) },
} as const

export async function updateTechnology(
  id: string,
  patch: UpdateTechnologyInput,
): Promise<TechnologyWriteResult> {
  const media = getMediaConfig()
  const pool = await getPool()

  const request = pool.request().input('id', sql.UniqueIdentifier, id)
  const assignments: string[] = []

  for (const [key, spec] of Object.entries(UPDATABLE_COLUMNS)) {
    const value = patch[key as keyof UpdateTechnologyInput]
    if (value === undefined) continue
    assignments.push(`${spec.column} = @${key}`)
    request.input(key, spec.type, value)
  }

  const update =
    assignments.length > 0
      ? `UPDATE dbo.Technology SET ${assignments.join(', ')} WHERE Id = @id;`
      : ''

  let rows: AdminTechnologyRow[]
  try {
    const result = await request.query<AdminTechnologyRow>(`${update}${SELECT_ADMIN_TECHNOLOGY}`)
    rows = result.recordset
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'name-taken' }
    throw error
  }

  const row = rows[0]
  if (!row) return { ok: false, error: 'not-found' }
  return { ok: true, technology: mapAdminTechnology(media)(row) }
}

/** Même construction que côté communautés, dont le commentaire porte le raisonnement. */
export const DELETE_TECHNOLOGY_QUERY = `
DECLARE @events INT = (SELECT COUNT(*) FROM dbo.EventTechnology WHERE TechnologyId = @id);
DECLARE @exists INT = (SELECT COUNT(*) FROM dbo.Technology WHERE Id = @id);

DELETE FROM dbo.Technology
WHERE Id = @id
  AND NOT EXISTS (SELECT 1 FROM dbo.EventTechnology WHERE TechnologyId = @id);

SELECT @events AS ReferencingEvents, @@ROWCOUNT AS DeletedRows, @exists AS Existed;
`

interface DeleteRow {
  ReferencingEvents: number
  DeletedRows: number
  Existed: number
}

export async function deleteTechnology(id: string): Promise<DeleteResult> {
  const pool = await getPool()

  let row: DeleteRow | undefined
  try {
    const result = await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .query<DeleteRow>(DELETE_TECHNOLOGY_QUERY)
    row = result.recordset[0]
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return { ok: false, error: 'referenced', eventCount: await countReferencingEvents(id) }
    }
    throw error
  }

  if (!row || row.Existed === 0) return { ok: false, error: 'not-found' }
  if (row.DeletedRows === 0) {
    return { ok: false, error: 'referenced', eventCount: row.ReferencingEvents }
  }
  return { ok: true }
}

async function countReferencingEvents(id: string): Promise<number> {
  const pool = await getPool()
  const result = await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query<{ EventCount: number }>(
      'SELECT COUNT(*) AS EventCount FROM dbo.EventTechnology WHERE TechnologyId = @id',
    )
  return result.recordset[0]?.EventCount ?? 0
}

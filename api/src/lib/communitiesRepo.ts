import { getMediaConfig, mediaUrl, type MediaConfig } from './mediaUrls'
import sql from 'mssql'
import { getPool } from './sqlClient'
import { isForeignKeyViolation, isUniqueViolation } from './sqlErrors'
import { SLUG_COLUMN_LENGTH } from './slug'

export interface CommunitySummary {
  id: string
  /**
   * The readable address of the community (#166).
   *
   * Exposed wherever a community is rendered as itself, because the public community page (#127)
   * will address itself by it. The identifier stays the key: this is how you *reach* a community,
   * not what it *is*.
   */
  slug: string
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
  Slug: string
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
SELECT Id, Slug, Name, LogoPath, Description
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
  c.Slug,
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
    slug: row.Slug,
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
    slug: row.Slug,
    name: row.Name,
    logoPath: row.LogoPath,
    logoUrl: mediaUrl(row.LogoPath, media),
    description: row.Description,
    status: row.Status,
    organizerCount: row.OrganizerCount,
    eventCount: row.EventCount,
  })
}

/**
 * What a write to the referential can answer.
 *
 * A duplicate name is a *refusal*, not an exception: it is a legitimate outcome the screen has
 * something to say about. Same construction as `MirrorResult` in userRepo — a discriminated
 * result, never a throw, so no caller can forget to handle it.
 */
export type CommunityWriteResult =
  | { ok: true; community: AdminCommunity }
  | { ok: false; error: 'name-taken' }
  /** `holder` is the community already carrying the slug, which #166 asks the refusal to name. */
  | { ok: false; error: 'slug-taken'; holder: string | null }
  | { ok: false; error: 'not-found' }

export interface CreateCommunityInput {
  name: string
  slug: string
  description: string | null
  logoPath: string | null
  status: ReferenceStatus
}

/**
 * A PATCH: a key that is absent is a field left alone, which is not the same as one set to null.
 *
 * Spelled out rather than `Partial<>` because of `exactOptionalPropertyTypes`: under it,
 * `Partial<T>` refuses an explicit `undefined`, which is exactly what the validated body hands
 * over for a key the caller omitted.
 */
export type UpdateCommunityInput = {
  [K in keyof CreateCommunityInput]?: CreateCommunityInput[K] | undefined
}

/**
 * The admin projection of one community, by id. Appended to a write so the caller gets the row
 * with its counts in the same round-trip rather than reading it back separately.
 */
const SELECT_ADMIN_COMMUNITY = `
SELECT
  c.Id,
  c.Slug,
  c.Name,
  c.LogoPath,
  c.Description,
  c.Status,
  (SELECT COUNT(*) FROM dbo.CommunityOrganizer co WHERE co.CommunityId = c.Id) AS OrganizerCount,
  (SELECT COUNT(*) FROM dbo.EventCommunity     ec WHERE ec.CommunityId = c.Id) AS EventCount
FROM dbo.Community AS c
WHERE c.Id = @id
`

export const CREATE_COMMUNITY_QUERY = `
DECLARE @created TABLE (Id UNIQUEIDENTIFIER);

INSERT INTO dbo.Community (Name, Slug, Description, LogoPath, Status)
OUTPUT inserted.Id INTO @created
VALUES (@name, @slug, @description, @logoPath, @status);

DECLARE @id UNIQUEIDENTIFIER = (SELECT TOP 1 Id FROM @created);
${SELECT_ADMIN_COMMUNITY}
`

export async function createCommunity(input: CreateCommunityInput): Promise<CommunityWriteResult> {
  const media = getMediaConfig()
  const pool = await getPool()

  let rows: AdminCommunityRow[]
  try {
    const result = await pool
      .request()
      .input('name', sql.NVarChar(200), input.name)
      .input('slug', sql.NVarChar(SLUG_COLUMN_LENGTH), input.slug)
      .input('description', sql.NVarChar(300), input.description)
      .input('logoPath', sql.NVarChar(500), input.logoPath)
      .input('status', sql.NVarChar(20), input.status)
      .query<AdminCommunityRow>(CREATE_COMMUNITY_QUERY)
    rows = result.recordset
  } catch (error) {
    // UX_Community_Name. Read-then-insert could always be overtaken between the two, so the
    // index is what actually decides and this reads its verdict.
    if (isUniqueViolation(error)) return refuseDuplicate(error, input.slug)
    throw error
  }

  const row = rows[0]
  if (!row) return { ok: false, error: 'not-found' }
  return { ok: true, community: mapAdminCommunity(media)(row) }
}

/**
 * Two unique indexes guard this table, and the caller has a different sentence for each. SQL
 * Server names the violated one in its message, which is the only place the distinction exists.
 */
async function refuseDuplicate(
  error: unknown,
  slug: string | undefined,
): Promise<CommunityWriteResult> {
  const message = (error as { message?: unknown } | null)?.message
  const onSlug = typeof message === 'string' && message.includes('UX_Community_Slug')
  if (!onSlug) return { ok: false, error: 'name-taken' }
  return { ok: false, error: 'slug-taken', holder: slug ? await nameHoldingSlug(slug) : null }
}

/** Read back so the refusal can name the community, as #166's edge case requires. */
async function nameHoldingSlug(slug: string): Promise<string | null> {
  const pool = await getPool()
  const result = await pool
    .request()
    .input('slug', sql.NVarChar(SLUG_COLUMN_LENGTH), slug)
    .query<{ Name: string }>('SELECT Name FROM dbo.Community WHERE Slug = @slug')
  return result.recordset[0]?.Name ?? null
}

/**
 * The columns a PATCH may touch, and the only place a request key becomes a column name.
 *
 * The SET clause is assembled from the keys actually present — `COALESCE` cannot serve here,
 * because `null` is a meaningful value for a description or a logo and would be indistinguishable
 * from "absent". Only keys of this record ever reach the statement, and every value stays a
 * typed parameter, so nothing a caller sends is ever concatenated into SQL.
 */
/**
 * Archiver une communauté la retire des préférences de tous les comptes (#191).
 *
 * Le raisonnement complet est dans `technologiesRepo`, sur son propre
 * `PURGE_TECHNOLOGY_PREFERENCES` : une préférence ne doit pas survivre à ce que l'utilisateur ne
 * peut plus ni voir dans ses filtres, ni retirer lui-même. Comme lui, ce fragment se garde sur le
 * statut et se pose après l'UPDATE.
 */
export const PURGE_COMMUNITY_PREFERENCES = `
DELETE FROM dbo.UserPreferredCommunity
WHERE CommunityId = @id
  AND EXISTS (SELECT 1 FROM dbo.Community WHERE Id = @id AND Status = 'archived');
`

const UPDATABLE_COLUMNS = {
  name: { column: 'Name', type: sql.NVarChar(200) },
  slug: { column: 'Slug', type: sql.NVarChar(SLUG_COLUMN_LENGTH) },
  description: { column: 'Description', type: sql.NVarChar(300) },
  logoPath: { column: 'LogoPath', type: sql.NVarChar(500) },
  status: { column: 'Status', type: sql.NVarChar(20) },
} as const

export async function updateCommunity(
  id: string,
  patch: UpdateCommunityInput,
): Promise<CommunityWriteResult> {
  const media = getMediaConfig()
  const pool = await getPool()

  const request = pool.request().input('id', sql.UniqueIdentifier, id)
  const assignments: string[] = []

  for (const [key, spec] of Object.entries(UPDATABLE_COLUMNS)) {
    const value = patch[key as keyof UpdateCommunityInput]
    if (value === undefined) continue
    assignments.push(`${spec.column} = @${key}`)
    request.input(key, spec.type, value)
  }

  // The schema already refuses an empty patch; this keeps the statement valid if that ever
  // changes, and answers the read rather than a syntax error.
  const update =
    assignments.length > 0
      ? `UPDATE dbo.Community SET ${assignments.join(', ')} WHERE Id = @id;`
      : ''

  let rows: AdminCommunityRow[]
  try {
    const result = await request.query<AdminCommunityRow>(
      `${update}${PURGE_COMMUNITY_PREFERENCES}${SELECT_ADMIN_COMMUNITY}`,
    )
    rows = result.recordset
  } catch (error) {
    if (isUniqueViolation(error)) return refuseDuplicate(error, patch.slug)
    throw error
  }

  const row = rows[0]
  if (!row) return { ok: false, error: 'not-found' }
  return { ok: true, community: mapAdminCommunity(media)(row) }
}

export type DeleteResult =
  | { ok: true }
  /** Des évènements la retiennent. Le nombre est ce que l'écran a à dire. */
  | { ok: false; error: 'referenced'; eventCount: number }
  | { ok: false; error: 'not-found' }

/**
 * Compte d'abord, supprime ensuite — et la suppression porte sa propre condition.
 *
 * Le `NOT EXISTS` n'est pas une ceinture de plus : entre le comptage et le DELETE, un évènement
 * peut être rattaché, et c'est la course que l'edge case de #155 décrit. La condition la ferme
 * côté base ; l'erreur 547 la ferme une seconde fois si la contrainte tranche la première. Dans
 * les deux cas le résultat est le même refus, avec un compte relu.
 *
 * Supprimer une communauté emporte ses désignations d'organisateur — `FK_CommunityOrganizer_
 * Community` cascade depuis la migration 0005, et c'est voulu : une désignation sur une
 * communauté qui n'existe plus n'accorde rien.
 */
export const DELETE_COMMUNITY_QUERY = `
DECLARE @events INT = (SELECT COUNT(*) FROM dbo.EventCommunity WHERE CommunityId = @id);
DECLARE @exists INT = (SELECT COUNT(*) FROM dbo.Community WHERE Id = @id);

DELETE FROM dbo.Community
WHERE Id = @id
  AND NOT EXISTS (SELECT 1 FROM dbo.EventCommunity WHERE CommunityId = @id);

SELECT @events AS ReferencingEvents, @@ROWCOUNT AS DeletedRows, @exists AS Existed;
`

interface DeleteRow {
  ReferencingEvents: number
  DeletedRows: number
  Existed: number
}

export async function deleteCommunity(id: string): Promise<DeleteResult> {
  const pool = await getPool()

  let row: DeleteRow | undefined
  try {
    const result = await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .query<DeleteRow>(DELETE_COMMUNITY_QUERY)
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

/** Relu après une course : le message doit nommer un nombre, pas dire « quelques-uns ». */
async function countReferencingEvents(id: string): Promise<number> {
  const pool = await getPool()
  const result = await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query<{ EventCount: number }>(
      'SELECT COUNT(*) AS EventCount FROM dbo.EventCommunity WHERE CommunityId = @id',
    )
  return result.recordset[0]?.EventCount ?? 0
}

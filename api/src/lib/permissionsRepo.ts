import sql from 'mssql'
import { getPool } from './sqlClient'

/**
 * What the caller is allowed to be, read from the LeHub database and from nowhere else.
 *
 * Feature #105 puts the role in the database rather than in the token, for two reasons. No
 * Microsoft-facing interface is exposed, so granting app roles would mean assigning them
 * from the Entra portal; and the fine half of the question — which organiser for which
 * community — is relational and would have to live here anyway. Putting the global marker
 * here too avoids two sources of truth.
 *
 * The cost is one read per authenticated request. It is accepted rather than carved into
 * the token precisely so that removing a designation takes effect immediately: the person
 * loses the community on their very next request, with no sign-out and no token renewal.
 * Caching this is a later optimisation, and only ever with an explicit invalidation.
 */
export interface SessionPermissions {
  isGlobalAdmin: boolean
  /** Communities the caller has been designated an organiser of. Empty is the normal case. */
  organizedCommunityIds: string[]
}

export interface PermissionRow {
  IsGlobalAdmin: boolean
  /** NULL on the row a caller with no designation still gets — see the LEFT JOIN below. */
  CommunityId: string | null
}

/**
 * One round-trip for both halves.
 *
 * The LEFT JOIN is what makes "administrator with no community" and "account with no mirror
 * row" different from each other without a second query: an existing account always yields
 * at least one row, carrying its marker and a NULL community, while an account with no
 * mirror row yields none at all. Two separate queries would have cost two round-trips on
 * every single authenticated request.
 */
export const RESOLVE_PERMISSIONS_QUERY = `
SELECT u.IsGlobalAdmin, o.CommunityId
FROM dbo.[User] AS u
LEFT JOIN dbo.CommunityOrganizer AS o ON o.UserObjectId = u.ExternalIdObjectId
WHERE u.ExternalIdObjectId = @objectId
`

/**
 * Turns the recordset into permissions. Split out from the query so the three shapes it has
 * to distinguish — no rows, one row with a NULL community, several rows — can be exercised
 * without a database.
 *
 * No rows means no mirror row, and yields an ordinary user rather than an error: it is the
 * normal state in the moment between a first tenant sign-in and the mirror being written.
 */
export function mapPermissions(rows: readonly PermissionRow[]): SessionPermissions {
  return {
    // Strict comparison: mssql maps BIT to a boolean, and anything else arriving here is a
    // schema drift that must not read as "administrator".
    isGlobalAdmin: rows[0]?.IsGlobalAdmin === true,
    organizedCommunityIds: rows
      .map((row) => row.CommunityId)
      .filter((id): id is string => id !== null),
  }
}

/**
 * Resolves the caller's permissions.
 *
 * A database failure propagates. There is deliberately no catch returning empty permissions:
 * that would turn an outage into a silent, total authorisation refusal — or, read the other
 * way round, would make "no permissions" indistinguishable from "we could not tell".
 */
export async function resolveSessionPermissions(objectId: string): Promise<SessionPermissions> {
  const pool = await getPool()
  const result = await pool
    .request()
    .input('objectId', sql.UniqueIdentifier, objectId)
    .query<PermissionRow>(RESOLVE_PERMISSIONS_QUERY)

  return mapPermissions(result.recordset)
}

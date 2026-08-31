import sql from 'mssql'
import { type Account } from './accountsRepo'
import { EMAIL_COLUMN_LENGTH } from './designationSchemas'
import { getPool } from './sqlClient'
import { isUniqueViolation } from './sqlErrors'

/**
 * The designations of a community: who may create and manage its events.
 *
 * "Organiser" is not a stored role, it is a consequence — whoever appears in
 * `dbo.CommunityOrganizer` for a community organises it, and nowhere else does the quality
 * exist (migration 0005). This module is the only thing that writes that table, and
 * `permissionsRepo` the only thing that reads it for a session.
 *
 * A removal here takes effect on the caller's very next request, because #108 resolves
 * permissions per request rather than freezing them into a token. That is why nothing in this
 * module invalidates anything: there is nothing to invalidate.
 */

interface AccountRow {
  GivenName: string
  Surname: string
  Email: string
}

function mapAccount(row: AccountRow): Account {
  return { givenName: row.GivenName, surname: row.Surname, email: row.Email }
}

/**
 * The designated people of one community.
 *
 * The same three columns as the search, and for the same reason: this screen shows who is
 * designated, not who they are. Sorted by surname, like every other people list here, so
 * the table's default order matches the column it sorts on first.
 */
export const LIST_ORGANIZERS_QUERY = `
SELECT u.GivenName, u.Surname, u.Email
FROM dbo.CommunityOrganizer AS o
INNER JOIN dbo.[User] AS u ON u.ExternalIdObjectId = o.UserObjectId
WHERE o.CommunityId = @communityId
ORDER BY u.Surname, u.GivenName
`

export async function listOrganizers(communityId: string): Promise<Account[]> {
  const pool = await getPool()
  const result = await pool
    .request()
    .input('communityId', sql.UniqueIdentifier, communityId)
    .query<AccountRow>(LIST_ORGANIZERS_QUERY)

  return result.recordset.map(mapAccount)
}

/** A refusal is a result, never a throw — the construction #150 established. */
export type DesignateResult =
  | { ok: true; account: Account }
  | { ok: false; error: 'account-not-found' }
  | { ok: false; error: 'community-not-found' }
  | { ok: false; error: 'already-designated' }

interface DesignateRow {
  Outcome: 'account-not-found' | 'community-not-found' | 'already-designated' | 'designated'
  GivenName: string | null
  Surname: string | null
  Email: string | null
}

/**
 * One batch, one round-trip: resolve the address, check the community, insert, and read back.
 *
 * `@@ROWCOUNT` is captured on the line that follows the INSERT and nowhere later — every
 * statement resets it, so a SELECT in between would silently turn "inserted" into "returned one
 * row" and the outcome would always read as a success.
 *
 * The `NOT EXISTS` is a courtesy, not the guarantee. Two concurrent designations can both pass
 * it, and `PK_CommunityOrganizer` is what actually refuses the second — `designateOrganizer`
 * reads that violation back as `already-designated` rather than letting it surface as a 500.
 * The composite key is the uniqueness rule, exactly as migration 0005 intended.
 *
 * `DesignatedBy` is the caller: an audit column, nullable only because a seed designation has
 * nobody to name.
 */
export const DESIGNATE_ORGANIZER_QUERY = `
DECLARE @objectId UNIQUEIDENTIFIER =
  (SELECT ExternalIdObjectId FROM dbo.[User] WHERE Email = @email);

IF @objectId IS NULL
  SELECT 'account-not-found' AS Outcome, NULL AS GivenName, NULL AS Surname, NULL AS Email;
ELSE IF NOT EXISTS (SELECT 1 FROM dbo.Community WHERE Id = @communityId)
  SELECT 'community-not-found' AS Outcome, NULL AS GivenName, NULL AS Surname, NULL AS Email;
ELSE
BEGIN
  INSERT INTO dbo.CommunityOrganizer (CommunityId, UserObjectId, DesignatedBy)
  SELECT @communityId, @objectId, @designatedBy
  WHERE NOT EXISTS (
    SELECT 1 FROM dbo.CommunityOrganizer
    WHERE CommunityId = @communityId AND UserObjectId = @objectId
  );

  DECLARE @inserted INT = @@ROWCOUNT;

  SELECT
    CASE WHEN @inserted = 1 THEN 'designated' ELSE 'already-designated' END AS Outcome,
    u.GivenName, u.Surname, u.Email
  FROM dbo.[User] AS u
  WHERE u.ExternalIdObjectId = @objectId;
END
`

export async function designateOrganizer(
  communityId: string,
  email: string,
  designatedBy: string,
): Promise<DesignateResult> {
  const pool = await getPool()

  let row: DesignateRow | undefined
  try {
    const result = await pool
      .request()
      .input('communityId', sql.UniqueIdentifier, communityId)
      .input('email', sql.NVarChar(EMAIL_COLUMN_LENGTH), email)
      .input('designatedBy', sql.UniqueIdentifier, designatedBy)
      .query<DesignateRow>(DESIGNATE_ORGANIZER_QUERY)
    row = result.recordset[0]
  } catch (error) {
    // The race the `NOT EXISTS` cannot close: the primary key closes it instead.
    if (isUniqueViolation(error)) return { ok: false, error: 'already-designated' }
    throw error
  }

  if (!row) return { ok: false, error: 'account-not-found' }
  if (row.Outcome === 'account-not-found') return { ok: false, error: 'account-not-found' }
  if (row.Outcome === 'community-not-found') return { ok: false, error: 'community-not-found' }
  if (row.Outcome === 'already-designated') return { ok: false, error: 'already-designated' }

  return {
    ok: true,
    account: { givenName: row.GivenName ?? '', surname: row.Surname ?? '', email: row.Email ?? '' },
  }
}

/**
 * Removing a designation.
 *
 * The address is joined rather than resolved first, so the whole removal is one statement and
 * cannot half-happen. Nothing here reports whether a row was actually deleted, and that is the
 * answer to "deux retraits concurrents de la même désignation : le second n'échoue pas" — a
 * DELETE whose effect is already obtained is a success. An unknown address is the same
 * non-event: the route answers 204 either way, which is also what keeps the refusal from
 * telling a caller whether an address is registered.
 *
 * Removing the last organiser of a community is allowed, deliberately: it stays manageable by
 * the global administrators. There is no guard to write, which is why none appears here.
 */
export const REMOVE_ORGANIZER_QUERY = `
DELETE o
FROM dbo.CommunityOrganizer AS o
INNER JOIN dbo.[User] AS u ON u.ExternalIdObjectId = o.UserObjectId
WHERE o.CommunityId = @communityId AND u.Email = @email
`

export async function removeOrganizer(communityId: string, email: string): Promise<void> {
  const pool = await getPool()
  await pool
    .request()
    .input('communityId', sql.UniqueIdentifier, communityId)
    .input('email', sql.NVarChar(EMAIL_COLUMN_LENGTH), email)
    .query(REMOVE_ORGANIZER_QUERY)
}

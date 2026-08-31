import sql from 'mssql'
import { type Account } from './accountsRepo'
import { EMAIL_COLUMN_LENGTH } from './designationSchemas'
import { getPool } from './sqlClient'

/**
 * The global administrator marker, granted and revoked.
 *
 * The marker is `dbo.[User].IsGlobalAdmin` (migration 0004) and this module is the only thing
 * that writes it outside the sign-in bootstrap. It deliberately never touches
 * `dbo.AdminBootstrap`: that table carries the *seed's intent*, and its `AppliedAt` stamp is
 * exactly what keeps an administrator removed here from being promoted again on the next seed
 * replay. Registering a backoffice promotion there would resurrect the failure 0004 was built to
 * prevent.
 */

interface AccountRow {
  GivenName: string
  Surname: string
  Email: string
}

/** The same three columns as everywhere else in this feature — see `accountsRepo`. */
export const LIST_GLOBAL_ADMINS_QUERY = `
SELECT u.GivenName, u.Surname, u.Email
FROM dbo.[User] AS u
WHERE u.IsGlobalAdmin = 1
ORDER BY u.Surname, u.GivenName
`

export async function listGlobalAdmins(): Promise<Account[]> {
  const pool = await getPool()
  const result = await pool.request().query<AccountRow>(LIST_GLOBAL_ADMINS_QUERY)

  return result.recordset.map((row) => ({
    givenName: row.GivenName,
    surname: row.Surname,
    email: row.Email,
  }))
}

export type GrantResult =
  | { ok: true; account: Account }
  | { ok: false; error: 'account-not-found' }
  | { ok: false; error: 'already-designated' }

interface GrantRow {
  Outcome: 'account-not-found' | 'already-admin' | 'granted'
  GivenName: string | null
  Surname: string | null
  Email: string | null
}

/**
 * Promoting an account.
 *
 * `IsGlobalAdmin = 0` in the predicate rather than a read-then-write: it makes the update
 * idempotent and tells "promoted" from "already was" by its row count alone, in one round-trip.
 * `@@ROWCOUNT` is captured immediately, before any SELECT resets it.
 *
 * Only an account that has already signed in can be promoted — there is no row to update
 * otherwise, and that is the prerequisite the whole Feature rests on rather than a limitation:
 * LeHub knows a person only by their passage through the identity.
 */
export const GRANT_GLOBAL_ADMIN_QUERY = `
UPDATE dbo.[User] SET IsGlobalAdmin = 1 WHERE Email = @email AND IsGlobalAdmin = 0;

DECLARE @granted INT = @@ROWCOUNT;

SELECT
  CASE
    WHEN @granted = 1 THEN 'granted'
    WHEN EXISTS (SELECT 1 FROM dbo.[User] WHERE Email = @email) THEN 'already-admin'
    ELSE 'account-not-found'
  END AS Outcome,
  u.GivenName, u.Surname, u.Email
FROM dbo.[User] AS u
WHERE u.Email = @email;
`

export async function grantGlobalAdmin(email: string): Promise<GrantResult> {
  const pool = await getPool()
  const result = await pool
    .request()
    .input('email', sql.NVarChar(EMAIL_COLUMN_LENGTH), email)
    .query<GrantRow>(GRANT_GLOBAL_ADMIN_QUERY)

  const row = result.recordset[0]
  // No row at all: the address matches no account, so the final SELECT returned nothing.
  if (!row || row.Outcome === 'account-not-found') return { ok: false, error: 'account-not-found' }
  if (row.Outcome === 'already-admin') return { ok: false, error: 'already-designated' }

  return {
    ok: true,
    account: { givenName: row.GivenName ?? '', surname: row.Surname ?? '', email: row.Email ?? '' },
  }
}

export type RevokeResult =
  /** Revoked, or there was nothing left to revoke. Both are a success for a DELETE. */
  | { ok: true }
  | { ok: false; error: 'last-admin' }

interface RevokeRow {
  Outcome: 'revoked' | 'last-admin' | 'nothing-to-do'
}

/**
 * Revoking the marker, with the one guard the whole story turns on: **the last administrator
 * cannot be removed**, or the backoffice becomes unadministrable.
 *
 * The guard is not a permission and could not live in `authz`: it depends on how many
 * administrators remain, which is a count, not a session. `canManageGlobalAdmins` says so.
 *
 * `WITH (UPDLOCK, HOLDLOCK)` on the count is what makes it hold, and it is the entire point of
 * writing this as one statement. Two concurrent revocations that both read 2 would both pass a
 * plain subquery and leave zero administrators. `UPDLOCK` takes an update lock as the count is
 * read, so the second transaction waits for the first to commit; `HOLDLOCK` holds it to the end
 * of the statement, so the range it scanned cannot change underneath. The second then re-reads
 * 1 and the predicate refuses it. The lock covers a table scan — there is no index on
 * `IsGlobalAdmin` — which is exactly the range that must not move, and costs nothing at this
 * size.
 *
 * Revoking one's own marker is allowed as long as one is not the last, and the interface warns
 * that access is lost with it. There is no special case here: a caller is an administrator like
 * any other.
 */
export const REVOKE_GLOBAL_ADMIN_QUERY = `
UPDATE u SET u.IsGlobalAdmin = 0
FROM dbo.[User] AS u
WHERE u.Email = @email
  AND u.IsGlobalAdmin = 1
  AND (SELECT COUNT(*) FROM dbo.[User] WITH (UPDLOCK, HOLDLOCK) WHERE IsGlobalAdmin = 1) > 1;

DECLARE @revoked INT = @@ROWCOUNT;

SELECT
  CASE
    WHEN @revoked = 1 THEN 'revoked'
    WHEN EXISTS (SELECT 1 FROM dbo.[User] WHERE Email = @email AND IsGlobalAdmin = 1)
      THEN 'last-admin'
    ELSE 'nothing-to-do'
  END AS Outcome;
`

export async function revokeGlobalAdmin(email: string): Promise<RevokeResult> {
  const pool = await getPool()
  const result = await pool
    .request()
    .input('email', sql.NVarChar(EMAIL_COLUMN_LENGTH), email)
    .query<RevokeRow>(REVOKE_GLOBAL_ADMIN_QUERY)

  // `nothing-to-do` covers both "not an administrator" and "no such account", and both answer
  // 204: a removal whose effect is already obtained is a success, and telling the two apart
  // would say whether an address is registered.
  return result.recordset[0]?.Outcome === 'last-admin'
    ? { ok: false, error: 'last-admin' }
    : { ok: true }
}

import sql from 'mssql'
import { getPool } from './sqlClient'
import { isUniqueViolation } from './sqlErrors'

/**
 * The mirror of an authenticated identity in LeHub's own database.
 *
 * `dbo.[User]` has existed since the initial migration and has been empty ever since. It is
 * keyed on the Entra object identifier because LeHub stores no credential: the identity
 * provider's subject is the natural primary key, and everything LeHub-specific hangs off it
 * without the tenant ever being queried again.
 *
 * Given name, surname and email come from the token's claims and from nowhere else. There is
 * no splitting of a `name` claim, no local part of an email address, no placeholder — the
 * legacy did exactly that and put users' email addresses in the site navigation. A review can
 * check this by reading the file: the only values written are the ones passed in.
 */
export type AuthMethod = 'email' | 'microsoft' | 'linkedin'

export interface MirrorInput {
  objectId: string
  email: string | null
  givenName: string | null
  surname: string | null
  authMethod: AuthMethod
}

export interface MirroredUser {
  objectId: string
  email: string
  givenName: string
  surname: string
  primaryAuthMethod: AuthMethod
  lastAuthMethod: AuthMethod
}

export type MirrorResult =
  | { ok: true; user: MirroredUser; created: boolean }
  /** No row yet, and not enough to build one. Nothing was written. */
  | { ok: false; error: 'incomplete-identity' }
  /** Another object identifier already mirrors this address. Nothing was written. */
  | { ok: false; error: 'email-taken' }

interface UserRow {
  Action: 'INSERT' | 'UPDATE'
  ExternalIdObjectId: string
  Email: string
  GivenName: string
  Surname: string
  PrimaryAuthMethod: AuthMethod
  LastAuthMethod: AuthMethod
}

/**
 * One statement, and the three rules of this table are visible in it.
 *
 * `PrimaryAuthMethod` appears in the INSERT and never in the UPDATE: that is what "fixed at
 * creation and never changed afterwards" means, enforced by there being no code path that
 * writes it again rather than by a comment saying so.
 *
 * `COALESCE` on the three identity columns keeps what is already stored when a later sign-in
 * arrives with a claim missing. A row that once had a name does not lose it because one token
 * came back thin; the anomaly is logged by the caller instead.
 *
 * The INSERT is conditional. The columns are NOT NULL, so a first sign-in whose claims carry
 * no name cannot produce a row — and rather than let the constraint throw, the condition makes
 * it a no-op that returns nothing, which the caller reads as a typed refusal. There is no
 * branch anywhere that invents a value to get past this.
 *
 * `HOLDLOCK` is what makes two simultaneous sign-ins of the same account safe. Without it,
 * MERGE checks for the row and inserts in two steps, and two sessions racing through that gap
 * both decide to insert — the second one failing on the primary key.
 */
export const MIRROR_USER_QUERY = `
MERGE dbo.[User] WITH (HOLDLOCK) AS target
USING (SELECT @objectId AS ExternalIdObjectId) AS source
  ON target.ExternalIdObjectId = source.ExternalIdObjectId
WHEN MATCHED THEN UPDATE SET
  Email          = COALESCE(@email, target.Email),
  GivenName      = COALESCE(@givenName, target.GivenName),
  Surname        = COALESCE(@surname, target.Surname),
  LastAuthMethod = @authMethod,
  LastLoginAt    = SYSUTCDATETIME()
WHEN NOT MATCHED
  AND @email IS NOT NULL AND @givenName IS NOT NULL AND @surname IS NOT NULL THEN INSERT
  (ExternalIdObjectId, Email, GivenName, Surname, PrimaryAuthMethod, LastAuthMethod)
  VALUES (@objectId, @email, @givenName, @surname, @authMethod, @authMethod)
OUTPUT
  $action AS Action,
  inserted.ExternalIdObjectId,
  inserted.Email,
  inserted.GivenName,
  inserted.Surname,
  inserted.PrimaryAuthMethod,
  inserted.LastAuthMethod;
`

/**
 * The second half of the administrator bootstrap (#106), run in the same batch as the mirror.
 *
 * `db/seed/admins.sql` only registers an address as pending; nothing promotes anyone until
 * that account signs in — which is the only moment its mirror row is guaranteed to exist.
 * These two statements are that moment.
 *
 * The order matters and is the opposite of the intuitive one. Stamping `AppliedAt` first
 * would mean a crash between the two statements leaves an address marked as applied on an
 * account that never got the marker: the promotion is then lost for good, since replaying
 * the seed deliberately re-arms nothing. Promoting first makes the same crash self-healing —
 * the next sign-in promotes again (already 1, so a no-op) and stamps.
 *
 * `AppliedAt IS NULL` in both predicates is what keeps this from being a standing rule: once
 * stamped, an administrator removed from the backoffice stays removed, however many times
 * they sign in afterwards.
 *
 * No row for `@objectId` — a first sign-in the mirror refused — makes both statements no-ops.
 */
export const APPLY_ADMIN_BOOTSTRAP_QUERY = `
UPDATE u SET u.IsGlobalAdmin = 1
FROM dbo.[User] AS u
INNER JOIN dbo.AdminBootstrap AS b ON b.Email = u.Email
WHERE u.ExternalIdObjectId = @objectId AND b.AppliedAt IS NULL;

UPDATE b SET b.AppliedAt = SYSUTCDATETIME()
FROM dbo.AdminBootstrap AS b
INNER JOIN dbo.[User] AS u ON u.Email = b.Email
WHERE u.ExternalIdObjectId = @objectId AND b.AppliedAt IS NULL;
`

/**
 * Re-exported rather than moved outright: `api/test/userRepo.test.ts` pins it here, and three
 * repositories now need it. It lives in lib/sqlErrors.
 */
export { isUniqueViolation } from './sqlErrors'

export async function mirrorUser(input: MirrorInput): Promise<MirrorResult> {
  const pool = await getPool()

  let recordset: UserRow[]
  try {
    const result = await pool
      .request()
      .input('objectId', sql.UniqueIdentifier, input.objectId)
      .input('email', sql.NVarChar(320), input.email)
      .input('givenName', sql.NVarChar(100), input.givenName)
      .input('surname', sql.NVarChar(100), input.surname)
      .input('authMethod', sql.NVarChar(20), input.authMethod)
      // One batch, one round-trip. The bootstrap statements produce no recordset of their
      // own — `recordset` is the MERGE's OUTPUT either way.
      .query<UserRow>(MIRROR_USER_QUERY + APPLY_ADMIN_BOOTSTRAP_QUERY)
    recordset = result.recordset
  } catch (error) {
    // UX_User_Email is unique: the address is already mirrored under a different object
    // identifier. Overwriting it would hand one person's row to another account, so this
    // surfaces as a refusal the caller logs rather than as a silent takeover.
    if (isUniqueViolation(error)) return { ok: false, error: 'email-taken' }
    throw error
  }

  const row = recordset[0]
  // Neither matched nor inserted: the conditional INSERT declined, which can only mean a
  // first sign-in without the claims a row needs.
  if (!row) return { ok: false, error: 'incomplete-identity' }

  return {
    ok: true,
    created: row.Action === 'INSERT',
    user: {
      objectId: row.ExternalIdObjectId,
      email: row.Email,
      givenName: row.GivenName,
      surname: row.Surname,
      primaryAuthMethod: row.PrimaryAuthMethod,
      lastAuthMethod: row.LastAuthMethod,
    },
  }
}

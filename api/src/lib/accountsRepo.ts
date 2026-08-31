import sql from 'mssql'
import { EMAIL_COLUMN_LENGTH, MAX_SEARCH_LENGTH, MAX_SEARCH_RESULTS } from './designationSchemas'
import { getPool } from './sqlClient'

/**
 * A LeHub account, as everything in this feature is allowed to see one.
 *
 * Three fields, and the list is the specification rather than a starting point (#157): no
 * habilitations of other people, no object identifier from the identity, no sign-in date. The
 * backoffice designates people; it does not profile them.
 *
 * The absence of an identifier is what makes the address the key — see `designationSchemas`.
 */
export interface Account {
  givenName: string
  surname: string
  email: string
}

interface AccountRow {
  GivenName: string
  Surname: string
  Email: string
}

export interface AccountSearchResult {
  accounts: Account[]
  /** More accounts matched than were returned. The screen invites narrowing rather than lying. */
  truncated: boolean
}

/**
 * `LIKE` treats four characters as syntax. A search for `100%` must find the person whose name
 * contains `100%`, not everyone.
 *
 * `\` first, or it would escape the backslashes the other three replacements just introduced.
 * `[` alone is enough — a `]` outside a class is a literal — and matches the choice migration
 * 0007 already made when it wrote character classes by hand.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_[]/g, (character) => `\\${character}`)
}

/**
 * How wide the pattern parameter has to be declared.
 *
 * **Not the query's own bound**, which is the trap: escaping doubles every one of the four
 * syntax characters, so a query made entirely of `%` comes back twice as long, and the two
 * surrounding wildcards add two more. Declared at the query's length, the driver would truncate
 * such a pattern silently — cutting it mid-escape, which either changes what it matches or makes
 * SQL Server reject the pattern outright and surfaces as a 500. Derived rather than written as a
 * number so it cannot fall behind `MAX_SEARCH_LENGTH`.
 */
export const PATTERN_PARAMETER_LENGTH = 2 * MAX_SEARCH_LENGTH + 2

/**
 * The one search in this API that reads the account table, and the first query-driven read in it
 * at all — the referentials are listed whole and filtered in the browser, which is not an option
 * here: the account table is unbounded and carries everyone's address.
 *
 * **`COLLATE Latin1_General_CI_AI`**, because the database's own collation is `CI_AS` — case
 * insensitive, accent *sensitive* — on both Azure SQL and the container (migration 0006 states
 * it), so `Amelie` would not find `Amélie`. Note this is a different problem from the one
 * migration 0007 solved: 0007 had to *strip* accents into a `VARCHAR` slug and needed CP1253 for
 * it, because a Latin1 code page can represent `é` and therefore keeps it. Comparing `NVARCHAR`
 * under an `_AI` collation folds `é` onto `e` and is all that is wanted here.
 *
 * The `COLLATE` makes the predicate non-SARGable, and the leading `%` would have anyway. That is
 * accepted: there is no index on the name columns, the table holds tens of rows, and buying an
 * index for a screen used a few times a month would be the wrong trade.
 *
 * The exact-address branch is separate from the pattern and comes first in the `ORDER BY`, which
 * is #157's "une adresse saisie en entier correspond exactement, sans être traitée comme un
 * fragment ambigu": typed in full, it is the first result rather than one of many.
 *
 * `TOP (@limit)` reads one row more than it returns. That surplus row is the whole overflow
 * signal — a second `COUNT(*)` would double the round-trip to learn strictly less.
 */
export const SEARCH_ACCOUNTS_QUERY = `
SELECT TOP (@limit) u.GivenName, u.Surname, u.Email
FROM dbo.[User] AS u
WHERE u.Email = @exact
   OR u.Email                          COLLATE Latin1_General_CI_AI LIKE @pattern ESCAPE '\\'
   OR u.GivenName                      COLLATE Latin1_General_CI_AI LIKE @pattern ESCAPE '\\'
   OR u.Surname                        COLLATE Latin1_General_CI_AI LIKE @pattern ESCAPE '\\'
   OR (u.GivenName + N' ' + u.Surname) COLLATE Latin1_General_CI_AI LIKE @pattern ESCAPE '\\'
ORDER BY CASE WHEN u.Email = @exact THEN 0 ELSE 1 END, u.Surname, u.GivenName
`

function mapAccount(row: AccountRow): Account {
  return { givenName: row.GivenName, surname: row.Surname, email: row.Email }
}

/**
 * Searches the accounts. The caller has already been authorised and the query already validated
 * — this only reads.
 *
 * `q` reaches the database as a parameter twice over: once whole, as the exact address, and once
 * wrapped in wildcards. Neither is ever concatenated into the statement.
 */
export async function searchAccounts(q: string): Promise<AccountSearchResult> {
  const pool = await getPool()
  const result = await pool
    .request()
    .input('exact', sql.NVarChar(EMAIL_COLUMN_LENGTH), q)
    .input('pattern', sql.NVarChar(PATTERN_PARAMETER_LENGTH), `%${escapeLikePattern(q)}%`)
    .input('limit', sql.Int, MAX_SEARCH_RESULTS + 1)
    .query<AccountRow>(SEARCH_ACCOUNTS_QUERY)

  const rows = result.recordset
  return {
    accounts: rows.slice(0, MAX_SEARCH_RESULTS).map(mapAccount),
    truncated: rows.length > MAX_SEARCH_RESULTS,
  }
}

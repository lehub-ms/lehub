/**
 * The SQL Server errors this API turns into refusals rather than into 500s.
 *
 * A constraint is not an exception to work around, it is the answer: the database is the only
 * place that can settle a race between two callers, so the code here reads its verdict instead
 * of trying to pre-empt it with a read-then-write that could always be overtaken.
 *
 * Extracted from userRepo, which held the first one, once a second repository needed it.
 */

/** Unique constraint (2627) and unique index (2601) — two codes, one meaning. */
const UNIQUE_VIOLATION = new Set([2601, 2627])

/** Foreign key constraint: the row is still referenced, so it cannot go. */
const FOREIGN_KEY_VIOLATION = 547

function errorNumber(error: unknown): number | null {
  const number = (error as { number?: unknown } | null)?.number
  return typeof number === 'number' ? number : null
}

export function isUniqueViolation(error: unknown): boolean {
  const number = errorNumber(error)
  return number !== null && UNIQUE_VIOLATION.has(number)
}

export function isForeignKeyViolation(error: unknown): boolean {
  return errorNumber(error) === FOREIGN_KEY_VIOLATION
}

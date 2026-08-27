/**
 * Where the identity written to `dbo.[User]` is decided, and the only place a value that did
 * not come from a token claim may enter it.
 *
 * Split out of the trigger so it can be read on its own and tested without a database: the
 * rule this file carries is the one the legacy broke, and a reviewer should be able to check
 * it by reading a page rather than by running the program.
 */

/**
 * Entra writes this literal into a directory attribute it was given nothing for. On the dev
 * tenant it sits in `displayName`, which nothing here reads — but the guard costs one
 * comparison, and the alternative is a user called "unknown" in the navigation.
 */
export const ENTRA_PLACEHOLDER = 'unknown'

/** The column widths of dbo.[User]. A longer value would fail as a truncation at write time. */
export const NAME_MAX_LENGTH = 100

/** A claim is usable when it is present and is not Entra's placeholder. */
export function usableClaim(value: string | null): string | null {
  if (value === null) return null
  return value === ENTRA_PLACEHOLDER ? null : value
}

/**
 * A claim, or the value the client submitted when the claim is missing.
 *
 * The case this exists for is narrow: the account is created on the last sign-up step and the
 * tokens are minted immediately after, so a directory write that has not propagated yet
 * produces a token without a name. The SPA still holds what the visitor typed, sends it along,
 * and the sign-up carries on with nothing shown on screen.
 *
 * A submitted value never wins over a claim. That direction is the whole rule: the tenant is
 * the source of truth for an identity, and the form is a stopgap for the moment it has not
 * caught up. There is no third source — no split of a `name` claim, no local part of an email
 * address, no placeholder. That is exactly what the legacy did, and it put users' email
 * addresses in the site navigation.
 */
export function resolveName(claim: string | null, submitted: unknown): string | null {
  const fromClaim = usableClaim(claim)
  if (fromClaim !== null) return fromClaim

  if (typeof submitted !== 'string') return null
  const trimmed = submitted.trim()
  if (trimmed === '' || trimmed.length > NAME_MAX_LENGTH) return null
  return trimmed
}

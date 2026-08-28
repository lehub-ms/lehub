import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose'
import { getEntraConfig, type EntraConfig } from './entraConfig'

/**
 * Turns a bearer token into an identity, or refuses it. The only place in the system allowed
 * to do so — no route reads a claim without coming through here.
 *
 * Four checks, none of them switchable: the signature against the tenant's published public
 * keys, the issuer, the audience, and the expiry. There is no flag, no environment variable
 * and no code path that skips any of them; `jwtVerify` fails closed on each.
 *
 * The audience is the client ID, and it is a GUID rather than `api://lehub-api` because the
 * registration sets `requestedAccessTokenVersion: 2` — that setting is exactly what decides
 * the form. A token minted for any other audience of the same tenant is refused, which is the
 * point: one registration serves both front-ends and the API, so the audience is the only
 * thing separating a token meant for this API from one that is not.
 */
export interface AuthenticatedIdentity {
  /** The Entra object identifier. The primary key of dbo.[User]. */
  objectId: string
  email: string | null
  givenName: string | null
  familyName: string | null
}

export type TokenRefusal =
  /** Presented, well-formed, and past its expiry. The client can renew and retry. */
  | { reason: 'expired'; detail: string }
  /** Absent, malformed, badly signed, or for another issuer or audience. */
  | { reason: 'invalid'; detail: string }
  /** The tenant's key set could not be read. A server fault, never an acceptance. */
  | { reason: 'jwks-unavailable'; detail: string }

export type TokenResult =
  | { ok: true; identity: AuthenticatedIdentity }
  | { ok: false; refusal: TokenRefusal }

/**
 * A short tolerance on expiry, for the clock drift between the tenant and this host. Long
 * enough to absorb a normal skew, short enough that it is not a way of honouring dead tokens.
 */
const CLOCK_TOLERANCE_SECONDS = 60

/**
 * jose caches the key set and refetches it when a token arrives signed by a key it does not
 * know, which is what makes a tenant key rotation a transient miss rather than an outage.
 * Held per worker process, like the connection pool.
 */
let remoteJwks: JWTVerifyGetKey | null = null

export function jwksFor(config: EntraConfig): JWTVerifyGetKey {
  if (!remoteJwks) remoteJwks = createRemoteJWKSet(new URL(config.jwksUri))
  return remoteJwks
}

/** jose's codes for a token that is simply not acceptable — every one of them is a 401. */
const TOKEN_ERROR_CODES = new Set([
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWT_INVALID',
  'ERR_JWS_INVALID',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JWKS_NO_MATCHING_KEY',
  'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
])

/**
 * And the codes that mean the key set itself could not be read — those are 500s.
 *
 * The list is not enough on its own. jose turns only a fetch *timeout* into `JWKSTimeout`;
 * a DNS failure, a TLS error or a reset connection is rethrown exactly as `fetch` raised it,
 * as a bare `TypeError` with no `code` at all. Since every error jose raises itself carries a
 * code, an error without one did not come from jose — it came from the network, and it is our
 * fault rather than the caller's.
 */
const JWKS_ERROR_CODES = new Set(['ERR_JWKS_TIMEOUT', 'ERR_JOSE_GENERIC'])

function codeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

/** A claim is only usable when it is a non-empty string; anything else is absent. */
function stringClaim(payload: JWTPayload, name: string): string | null {
  const value = payload[name]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * The key set is injectable so tests can forge tokens against a local key pair instead of
 * reaching a real tenant — a test that needs the network is a test that does not run in CI.
 */
export async function verifyAccessToken(
  token: string,
  config: EntraConfig = getEntraConfig(),
  keys: JWTVerifyGetKey = jwksFor(config),
): Promise<TokenResult> {
  let payload: JWTPayload
  try {
    ;({ payload } = await jwtVerify(token, keys, {
      issuer: config.issuer,
      audience: config.clientId,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    }))
  } catch (error) {
    const code = codeOf(error)
    const detail = error instanceof Error ? error.message : 'token verification failed'

    if (code === 'ERR_JWT_EXPIRED') return { ok: false, refusal: { reason: 'expired', detail } }

    // No code, or a known key-set code: the tenant could not be reached. Answering 401 here
    // would tell every signed-in user to sign in again during an outage they cannot fix, and
    // the client treats a 401 as fatal — one blip at ciamlogin.com would empty every session.
    if (code === null || JWKS_ERROR_CODES.has(code)) {
      return { ok: false, refusal: { reason: 'jwks-unavailable', detail } }
    }

    // Everything else is a refusal, never an acceptance: the default direction of this branch
    // is the whole security property.
    if (!TOKEN_ERROR_CODES.has(code)) {
      return { ok: false, refusal: { reason: 'invalid', detail: `${detail} (${code})` } }
    }
    return { ok: false, refusal: { reason: 'invalid', detail } }
  }

  // `oid` is the directory object identifier and is stable across a rename or an email change;
  // `sub` is pairwise per application and is not. dbo.[User] is keyed on the first.
  const objectId = stringClaim(payload, 'oid')
  if (!objectId) {
    return { ok: false, refusal: { reason: 'invalid', detail: 'the token carries no oid claim' } }
  }

  return {
    ok: true,
    identity: {
      objectId,
      email: stringClaim(payload, 'email'),
      givenName: stringClaim(payload, 'given_name'),
      familyName: stringClaim(payload, 'family_name'),
    },
  }
}

/**
 * Reads the bearer token out of an Authorization header.
 *
 * A header without the `Bearer` scheme is the same thing as no header at all: refused, not
 * guessed at. The scheme is matched case-insensitively because RFC 6750 says it is.
 */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null
  const match = /^Bearer[ ]+(.+)$/i.exec(header.trim())
  const token = match?.[1]?.trim()
  return token ? token : null
}

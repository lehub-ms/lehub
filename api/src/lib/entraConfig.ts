/**
 * What the API needs to talk to the Entra External ID tenant, read off the environment.
 *
 * Same construction as sqlClient and mediaUrls: a pure function over `env`, a discriminated
 * result rather than an exception, and no silent fallback. A tenant guessed from a default
 * would authenticate against the wrong directory, which is the one failure mode that must
 * never be recoverable at runtime.
 *
 * Two strings, not one. The authority carries the tenant's *subdomain* as its host and is
 * where the JWKS hangs off; the issuer carries the tenant's *GUID* as its host and is what
 * `iss` must equal in a token. `infra/main.bicep` derives them separately for that reason,
 * and confusing the two fails at the first sign-in and nowhere before, so `build` refuses an
 * authority whose host is a GUID rather than letting it through.
 *
 * The Native Authentication base is derived here rather than added as a fifth app setting.
 * The `appsettings` block in infra/modules/functionApp.bicep replaces the whole set on every
 * deployment and the CD workflow is forbidden from adding to it, so a value that can be
 * computed from one already present is one less thing to keep in step across three places.
 */
export interface EntraConfig {
  tenantId: string
  clientId: string
  /** Subdomain host, no trailing slash. The JWKS hangs off this. */
  authority: string
  /** Tenant-GUID host. What the `iss` claim must equal. */
  issuer: string
  /** The tenant subdomain, e.g. `lehubextiddev`. */
  tenantSubdomain: string
  /** Base of the Native Authentication endpoints, no trailing slash. */
  nativeAuthBaseUrl: string
}

export type EntraConfigError =
  | { kind: 'missing-tenant-id' }
  | { kind: 'missing-client-id' }
  | { kind: 'missing-authority' }
  | { kind: 'missing-issuer' }
  | { kind: 'invalid-authority' }
  | { kind: 'authority-is-the-issuer' }

export type EntraConfigResult =
  | { ok: true; config: EntraConfig }
  | { ok: false; error: EntraConfigError }

const CONFIG_ERROR_MESSAGES: Record<EntraConfigError['kind'], string> = {
  'missing-tenant-id': 'ENTRA_TENANT_ID must be set to the external tenant directory ID.',
  'missing-client-id': 'ENTRA_CLIENT_ID must be set to the application (client) ID registered in the external tenant.',
  'missing-authority': 'ENTRA_AUTHORITY must be set, as in https://lehubextiddev.ciamlogin.com/<tenant-id>/v2.0.',
  'missing-issuer': 'ENTRA_ISSUER must be set, as in https://<tenant-id>.ciamlogin.com/<tenant-id>/v2.0.',
  'invalid-authority': 'ENTRA_AUTHORITY must be an absolute https URL on a <subdomain>.ciamlogin.com host.',
  'authority-is-the-issuer': 'ENTRA_AUTHORITY carries the tenant subdomain as its host, not the tenant GUID. The GUID host is ENTRA_ISSUER, and the two are not interchangeable.',
}

export function describeEntraConfigError(error: EntraConfigError): string {
  return CONFIG_ERROR_MESSAGES[error.kind]
}

const CIAM_HOST_SUFFIX = '.ciamlogin.com'
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Exported so it can be unit-tested without an environment: it is pure, it only reads `env`. */
export function buildEntraConfig(env: NodeJS.ProcessEnv = process.env): EntraConfigResult {
  const tenantId = env['ENTRA_TENANT_ID']?.trim()
  const clientId = env['ENTRA_CLIENT_ID']?.trim()
  const authority = env['ENTRA_AUTHORITY']?.trim()
  const issuer = env['ENTRA_ISSUER']?.trim()

  if (!tenantId) return { ok: false, error: { kind: 'missing-tenant-id' } }
  if (!clientId) return { ok: false, error: { kind: 'missing-client-id' } }
  if (!authority) return { ok: false, error: { kind: 'missing-authority' } }
  if (!issuer) return { ok: false, error: { kind: 'missing-issuer' } }

  let parsed: URL
  try {
    parsed = new URL(authority)
  } catch {
    return { ok: false, error: { kind: 'invalid-authority' } }
  }
  if (parsed.protocol !== 'https:') return { ok: false, error: { kind: 'invalid-authority' } }
  if (!parsed.hostname.endsWith(CIAM_HOST_SUFFIX)) {
    return { ok: false, error: { kind: 'invalid-authority' } }
  }

  const tenantSubdomain = parsed.hostname.slice(0, -CIAM_HOST_SUFFIX.length)
  if (!tenantSubdomain) return { ok: false, error: { kind: 'invalid-authority' } }
  // Named apart from `invalid-authority` because it is the mistake someone actually makes:
  // both values are well-formed URLs on the same domain, and only the host tells them apart.
  if (GUID.test(tenantSubdomain)) return { ok: false, error: { kind: 'authority-is-the-issuer' } }

  return {
    ok: true,
    config: {
      tenantId,
      clientId,
      authority: authority.replace(/\/+$/, ''),
      issuer: issuer.replace(/\/+$/, ''),
      tenantSubdomain,
      // The path segment is the tenant's primary domain, not its GUID — that is the shape the
      // Native Authentication reference documents, and the GUID form is not accepted there.
      nativeAuthBaseUrl: `https://${parsed.hostname}/${tenantSubdomain}.onmicrosoft.com`,
    },
  }
}

/** True when the environment holds a usable configuration — mirrors isSqlConfigured. */
export function isEntraConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return buildEntraConfig(env).ok
}

// Resolved once per worker process, like the connection pool.
let config: EntraConfig | null = null

export function getEntraConfig(): EntraConfig {
  if (config) return config

  const result = buildEntraConfig()
  if (!result.ok) throw new Error(describeEntraConfigError(result.error))

  config = result.config
  return config
}

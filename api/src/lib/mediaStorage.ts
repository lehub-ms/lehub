import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob'
import { ManagedIdentityCredential } from '@azure/identity'

/**
 * Write access to the media container.
 *
 * Same construction as `sqlClient`: a pure function over `env`, a discriminated result rather
 * than an exception, and no silent fallback. A missing setting is a deployment error and has to
 * read as one.
 *
 * The container is the *only* way to write to that storage account. `allowSharedKeyAccess` is
 * false on it, so no key and no account SAS exists to hand a browser; and letting the browser
 * upload directly would need a CORS rule on the account plus a credential in the page, which is
 * exactly what Story #154 rules out with "le conteneur n'est jamais joignable en écriture
 * autrement". Going through the Function App needs neither.
 */
export type MediaStorageConfig =
  | { mode: 'managed-identity'; serviceUrl: string; container: string; clientId: string }
  | { mode: 'emulator'; connectionString: string; container: string }

export type MediaStorageConfigError =
  | { kind: 'missing-base-url' }
  | { kind: 'invalid-base-url' }
  | { kind: 'missing-client-id' }

export type MediaStorageConfigResult =
  | { ok: true; config: MediaStorageConfig }
  | { ok: false; error: MediaStorageConfigError }

const CONFIG_ERROR_MESSAGES: Record<MediaStorageConfigError['kind'], string> = {
  'missing-base-url': 'MEDIA_BASE_URL must be set to the absolute base of the media container.',
  'invalid-base-url':
    'MEDIA_BASE_URL must end with the container name, as in https://<account>.blob.core.windows.net/media.',
  'missing-client-id':
    'MEDIA_MI_CLIENT_ID must carry the client id of the user-assigned managed identity.',
}

export function describeMediaStorageConfigError(error: MediaStorageConfigError): string {
  return CONFIG_ERROR_MESSAGES[error.kind]
}

/**
 * The service URL and the container name, taken apart from `MEDIA_BASE_URL`.
 *
 * Derived rather than declared: the base URL already carries both, and a second setting saying
 * the same thing is a second setting that can disagree with the first. Works unchanged for the
 * Azure form and for Azurite's `http://127.0.0.1:10000/devstoreaccount1/media`, whose account is
 * a path segment rather than a subdomain.
 */
export function parseMediaContainer(
  baseUrl: string,
): { serviceUrl: string; container: string } | null {
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    return null
  }

  const segments = parsed.pathname.split('/').filter(Boolean)
  const container = segments.pop()
  if (!container) return null

  const path = segments.length > 0 ? `/${segments.join('/')}` : ''
  return { serviceUrl: `${parsed.origin}${path}`, container }
}

/** Exported so it can be unit-tested without an environment: it is pure, it only reads `env`. */
export function buildMediaStorageConfig(
  env: NodeJS.ProcessEnv = process.env,
): MediaStorageConfigResult {
  const baseUrl = env['MEDIA_BASE_URL']?.trim()
  if (!baseUrl) return { ok: false, error: { kind: 'missing-base-url' } }

  const parts = parseMediaContainer(baseUrl)
  if (!parts) return { ok: false, error: { kind: 'invalid-base-url' } }

  // Azurite speaks plain HTTP and accepts no Entra token, so locally this is not a convenience,
  // it is the only thing that works. Same split as SQL_AUTH_MODE, and the same connection string
  // scripts/lib/blob-seed.mjs already uses, so there is one local convention rather than two.
  if (env['MEDIA_STORAGE_AUTH_MODE']?.trim() === 'emulator') {
    return {
      ok: true,
      config: {
        mode: 'emulator',
        connectionString: 'UseDevelopmentStorage=true',
        container: parts.container,
      },
    }
  }

  const clientId = env['MEDIA_MI_CLIENT_ID']?.trim()
  if (!clientId) return { ok: false, error: { kind: 'missing-client-id' } }

  return { ok: true, config: { mode: 'managed-identity', ...parts, clientId } }
}

// Resolved once per worker process, like the connection pool.
let container: ContainerClient | null = null

/**
 * `ManagedIdentityCredential` and not `DefaultAzureCredential`: the Function App carries a
 * *user-assigned* identity, and the default chain would try five other sources first — one of
 * which could resolve, wrongly, in a way that only shows up in production. The same reasoning
 * `SQL_MI_CLIENT_ID` already encodes.
 */
export function getMediaContainer(): ContainerClient {
  if (container) return container

  const result = buildMediaStorageConfig()
  if (!result.ok) throw new Error(describeMediaStorageConfigError(result.error))

  const service =
    result.config.mode === 'emulator'
      ? BlobServiceClient.fromConnectionString(result.config.connectionString)
      : new BlobServiceClient(
          result.config.serviceUrl,
          new ManagedIdentityCredential({ clientId: result.config.clientId }),
        )

  container = service.getContainerClient(result.config.container)
  return container
}

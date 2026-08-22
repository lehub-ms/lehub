/**
 * Media references travel as blob paths, never as absolute URLs.
 *
 * The database stores `communities/aznug.png`; the absolute URL is composed here from
 * `MEDIA_BASE_URL`, so the same dataset is valid locally, on dev and on prod. Clients still
 * receive absolute URLs — the shape of the public contract does not change.
 *
 * Same construction as sqlClient: a pure function over `env`, a discriminated result rather
 * than an exception, and no silent fallback. A missing setting is a deployment error and has
 * to read as one; serving a relative path instead would produce images that 404 against the
 * static host, which looks like anything but a configuration problem.
 */
export interface MediaConfig {
  /** Absolute, with no trailing slash. */
  baseUrl: string
}

export type MediaConfigError = { kind: 'missing-base-url' } | { kind: 'invalid-base-url' }

export type MediaConfigResult =
  | { ok: true; config: MediaConfig }
  | { ok: false; error: MediaConfigError }

const CONFIG_ERROR_MESSAGES: Record<MediaConfigError['kind'], string> = {
  'missing-base-url': 'MEDIA_BASE_URL must be set to the absolute base of the media container.',
  'invalid-base-url': 'MEDIA_BASE_URL must be an absolute http(s) URL, as in https://<account>.blob.core.windows.net/media.',
}

export function describeMediaConfigError(error: MediaConfigError): string {
  return CONFIG_ERROR_MESSAGES[error.kind]
}

/** Exported so it can be unit-tested without an environment: it is pure, it only reads `env`. */
export function buildMediaConfig(env: NodeJS.ProcessEnv = process.env): MediaConfigResult {
  const baseUrl = env['MEDIA_BASE_URL']?.trim()

  if (!baseUrl) {
    return { ok: false, error: { kind: 'missing-base-url' } }
  }

  // A relative or malformed value would concatenate into something that looks like a URL and
  // is not, so it is refused here rather than discovered in a browser's network tab.
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    return { ok: false, error: { kind: 'invalid-base-url' } }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: { kind: 'invalid-base-url' } }
  }

  // Normalised once, here, so the join below never has to think about it.
  return { ok: true, config: { baseUrl: baseUrl.replace(/\/+$/, '') } }
}

/**
 * The stored path to the URL a client can fetch, or `null` when there is no media.
 *
 * Absent stays absent: an empty or blank path is the same thing as no path, and neither
 * becomes a truncated URL pointing at the container root. Whether the blob behind a path
 * exists is the client's problem — the API does not check, and a broken image is what the
 * front-end fallbacks are for.
 *
 * The path is a blob name, not a URL fragment, and blob names legitimately contain `#`, `?`
 * and spaces. Pasted in raw, a `#` truncates the URL at the fragment and a `?` turns the
 * rest into a query string, so each segment is percent-encoded. `.` and `..` segments are
 * refused outright: they are never part of a real blob name, and a browser would resolve
 * them before sending the request, letting a stored path address something outside the
 * media container. A malformed path is treated as no media rather than as a URL to guess at.
 */
export function mediaUrl(path: string | null | undefined, config: MediaConfig): string | null {
  const trimmed = path?.trim()
  if (!trimmed) return null

  const segments = trimmed.split('/').filter((segment) => segment !== '')
  if (segments.length === 0) return null
  if (segments.some((segment) => segment === '.' || segment === '..')) return null

  return `${config.baseUrl}/${segments.map(encodeURIComponent).join('/')}`
}

/** True when the environment holds a usable configuration — mirrors isSqlConfigured. */
export function isMediaConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return buildMediaConfig(env).ok
}

// Resolved once per worker process, like the connection pool.
let config: MediaConfig | null = null

export function getMediaConfig(): MediaConfig {
  if (config) return config

  const result = buildMediaConfig()
  if (!result.ok) throw new Error(describeMediaConfigError(result.error))

  config = result.config
  return config
}

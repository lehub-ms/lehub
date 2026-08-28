import { ensureFreshToken } from '../auth/authClient'
import type { AuthenticatedUser } from '../auth/AuthContext'

/**
 * Every call is absolute and cross-origin — there is no dev proxy and no
 * Static Web Apps `/api` rewrite. See vite.config.ts for why.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL

if (!BASE_URL) {
  // Fail loudly at start-up rather than issuing requests to the wrong origin.
  throw new Error(
    'VITE_API_BASE_URL is not set. Copy .env.example to .env.local, or check the workflow that builds this app.',
  )
}

export class ApiError extends Error {
  readonly status: number
  /** The `{ code, message }` body the API answers errors with, when it sent one. */
  readonly code: string | null

  /** `status` is 0 when the request never reached the server. */
  constructor(message: string, status: number, code: string | null = null, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // Renewed before the call rather than after a 401: a request must not fail on a stale
  // token when a renewal was possible. Anonymous callers get null and no header, which is
  // the normal case on the public listings.
  const token = await ensureFreshToken()
  const headers = new Headers(init?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, headers })
  } catch (cause) {
    // fetch only rejects on network failure or a blocked CORS preflight.
    throw new ApiError(`Aucune réponse de ${BASE_URL}.`, 0, null, { cause })
  }

  if (!response.ok) {
    let code: string | null = null
    try {
      const body: unknown = await response.json()
      if (typeof body === 'object' && body !== null && typeof (body as { code?: unknown }).code === 'string') {
        code = (body as { code: string }).code
      }
    } catch {
      // An error without a readable body is still an error; the status carries it.
    }
    throw new ApiError(`L'API a répondu ${response.status}.`, response.status, code)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/**
 * Ouvre la session côté LeHub : crée la ligne miroir à la première connexion, la rafraîchit
 * ensuite. Le prénom et le nom ne sont transmis que comme repli, pour la fenêtre où le tenant
 * n'a pas encore propagé les siens ; les claims l'emportent toujours côté API.
 */
export function openSession(fallback?: { givenName?: string; surname?: string }): Promise<AuthenticatedUser> {
  return apiFetch<AuthenticatedUser>('/api/me/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fallback ?? {}),
  })
}

export interface NamedRef {
  id: string
  name: string
  /** Absolute, composed by the API from the blob path it stores. Null when there is no logo. */
  logoUrl: string | null
}

export interface EventSummary {
  id: string
  title: string
  description: string | null
  startDate: string
  endDate: string
  bannerImageUrl: string | null
  format: string
  mode: string
  communities: NamedRef[]
  technologies: NamedRef[]
}

export function listUpcomingEvents(): Promise<EventSummary[]> {
  return apiFetch<EventSummary[]>('/api/events')
}

export interface CommunitySummary {
  id: string
  name: string
  logoUrl: string | null
  description: string | null
}

export function listCommunities(): Promise<CommunitySummary[]> {
  return apiFetch<CommunitySummary[]>('/api/communities')
}

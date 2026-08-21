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

  /** `status` is 0 when the request never reached the server. */
  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, init)
  } catch (cause) {
    // fetch only rejects on network failure or a blocked CORS preflight.
    throw new ApiError(`Aucune réponse de ${BASE_URL}.`, 0, { cause })
  }

  if (!response.ok) {
    throw new ApiError(`L'API a répondu ${response.status}.`, response.status)
  }

  return (await response.json()) as T
}

export interface NamedRef {
  id: string
  name: string
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

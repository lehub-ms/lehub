import { apiFetch } from '@shared/lib/api'

// Réexporté plutôt que réimporté partout : `@/lib/api` reste l'unique porte d'entrée
// réseau du site public, que le transport vive ici ou dans le socle partagé.
export { ApiError, apiFetch, openSession, type OpenedSession } from '@shared/lib/api'

/**
 * Les routes propres au site public. Le transport — `apiFetch`, `ApiError`, l'ouverture de
 * session — vit dans `@shared/lib/api`, partagé avec le backoffice ; ici ne restent que les
 * listes que lehub.ms est seul à lire.
 */
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

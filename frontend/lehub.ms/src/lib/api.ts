import { apiFetch } from '@lehub/shared/lib/api'
import type { NamedRef } from '@lehub/shared/lib/api'

// Réexporté plutôt que réimporté partout : `@/lib/api` reste l'unique porte d'entrée
// réseau du site public, que le transport vive ici ou dans le socle partagé.
export {
  ApiError,
  apiFetch,
  listCommunities,
  openSession,
  type CommunitySummary,
  type NamedRef,
  type OpenedSession,
} from '@lehub/shared/lib/api'

/**
 * Les routes propres au site public. Le transport — `apiFetch`, `ApiError`, l'ouverture de
 * session — vit dans `@lehub/shared/lib/api`, partagé avec le backoffice ; ici ne restent que les
 * listes que lehub.ms est seul à lire.
 */
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


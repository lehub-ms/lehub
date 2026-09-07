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

/**
 * Les préférences d'évènements du compte de la session.
 *
 * `saved` porte la distinction que toute l'interface oppose : `false` veut dire « aucune
 * préférence enregistrée », `true` avec deux listes vides veut dire « tous les évènements », qui
 * est un choix. Elle ne se déduit jamais de la longueur des listes — c'est l'API qui la dit.
 *
 * Les entrées voyagent en `NamedRef` complets et non en identifiants nus : le récapitulatif du
 * profil affiche le nom courant et le logo, et une entrée archivée doit rester nommable alors
 * qu'aucune liste publique ne la propose plus.
 */
export interface EventPreferences {
  saved: boolean
  communities: NamedRef[]
  technologies: NamedRef[]
}

export function getMyPreferences(): Promise<EventPreferences> {
  return apiFetch<EventPreferences>('/api/me/preferences')
}

/** Remplacement intégral : la sélection complète, jamais un écart. */
export function saveMyPreferences(selection: {
  communityIds: string[]
  technologyIds: string[]
}): Promise<EventPreferences> {
  return apiFetch<EventPreferences>('/api/me/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(selection),
  })
}

export function deleteMyPreferences(): Promise<void> {
  return apiFetch<void>('/api/me/preferences', { method: 'DELETE' })
}


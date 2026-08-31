/**
 * Les routes propres au backoffice. Le transport — `apiFetch`, `ApiError`, l'ouverture de
 * session — vient de `@lehub/shared/lib/api`, partagé avec le site public : les deux applications
 * parlent à la même Function App, en cross-origin, et rien de ce fichier n'est une décision
 * de confiance. L'API arbitre (#109).
 */
import { apiFetch } from '@lehub/shared/lib/api'

export {
  ApiError,
  apiFetch,
  listCommunities,
  openSession,
  type CommunitySummary,
  type NamedRef,
  type OpenedSession,
} from '@lehub/shared/lib/api'

export interface HealthStatus {
  status: string
  sqlConfigured: boolean
  mediaConfigured: boolean
  timestamp: string
}

export function getHealth(): Promise<HealthStatus> {
  return apiFetch<HealthStatus>('/api/health')
}

/**
 * Le statut d'une entrée de référentiel. La colonne le porte en toutes lettres (migration 0006),
 * et le contrat le rend tel quel — pas de booléen à retraduire de part et d'autre.
 */
export type ReferenceStatus = 'active' | 'archived'

/**
 * Une entrée de référentiel telle que le backoffice la voit, et telle que le contrat public ne
 * la montre jamais : avec son statut, ses compteurs, et le chemin de son logo en plus de l'URL.
 *
 * Le chemin **et** l'URL : le panneau renvoie le chemin tel quel à l'enregistrement, l'aperçu
 * affiche l'URL. Recomposer l'un depuis l'autre mettrait `mediaUrls` dans le navigateur.
 */
interface ReferenceEntryBase {
  id: string
  name: string
  logoPath: string | null
  logoUrl: string | null
  status: ReferenceStatus
  /** Évènements rattachés. Zéro est ce qui rend la suppression définitive possible (#155). */
  eventCount: number
}

export interface AdminCommunity extends ReferenceEntryBase {
  description: string | null
  /** Désignations en vigueur. Zéro n'est pas une anomalie (#151). */
  organizerCount: number
}

export type AdminTechnology = ReferenceEntryBase

export function listAdminCommunities(): Promise<AdminCommunity[]> {
  return apiFetch<AdminCommunity[]>('/api/admin/communities')
}

export function listAdminTechnologies(): Promise<AdminTechnology[]> {
  return apiFetch<AdminTechnology[]>('/api/admin/technologies')
}

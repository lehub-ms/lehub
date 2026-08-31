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
  /** L'adresse lisible de la communauté (#166) : modifiable, contrairement à l'identifiant. */
  slug: string
  description: string | null
  /** Désignations en vigueur. Zéro n'est pas une anomalie (#151). */
  organizerCount: number
}

export type AdminTechnology = ReferenceEntryBase

export function listAdminCommunities(): Promise<AdminCommunity[]> {
  return apiFetch<AdminCommunity[]>('/api/manage/communities')
}

export function listAdminTechnologies(): Promise<AdminTechnology[]> {
  return apiFetch<AdminTechnology[]>('/api/manage/technologies')
}

/** Le corps accepté à la création. Le serveur fait foi — voir `api/src/lib/referenceSchemas.ts`. */
export interface CommunityInput {
  name: string
  /** Facultatif à la création : absent, le serveur le dérive du nom. */
  slug?: string
  description: string | null
  logoPath: string | null
  status: ReferenceStatus
}

export type TechnologyInput = Omit<CommunityInput, 'description'>

export function createCommunity(input: CommunityInput): Promise<AdminCommunity> {
  return apiFetch<AdminCommunity>('/api/manage/communities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/** Un champ absent est un champ inchangé ; `null` efface. Voir la route PATCH. */
export function updateCommunity(
  id: string,
  patch: Partial<CommunityInput>,
): Promise<AdminCommunity> {
  return apiFetch<AdminCommunity>(`/api/manage/communities/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

export function createTechnology(input: TechnologyInput): Promise<AdminTechnology> {
  return apiFetch<AdminTechnology>('/api/manage/technologies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function updateTechnology(
  id: string,
  patch: Partial<TechnologyInput>,
): Promise<AdminTechnology> {
  return apiFetch<AdminTechnology>(`/api/manage/technologies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

/** Les destinations que la route de téléversement accepte aujourd’hui. */
export type UploadDestination = 'community-logo' | 'technology-logo'

export interface UploadedImage {
  /** Le chemin relatif à enregistrer sur l’entité. */
  path: string
  /** L’URL absolue, pour l’aperçu — jamais recomposée ici. */
  url: string | null
}

/**
 * Pas d’en-tête `Content-Type` posé à la main : le navigateur le compose lui-même à partir du
 * `FormData`, avec la frontière multipart qu’il vient de tirer. En poser un le priverait de
 * cette frontière et le corps deviendrait illisible côté serveur.
 */
export function uploadImage(file: File, destination: UploadDestination): Promise<UploadedImage> {
  const form = new FormData()
  form.set('destination', destination)
  form.set('file', file)

  return apiFetch<UploadedImage>('/api/media/uploads', { method: 'POST', body: form })
}

/**
 * Un compte LeHub, tel que le backoffice a le droit de le voir.
 *
 * Trois champs, et c'est la spécification et non un début (#157) : ni habilitations d'autrui,
 * ni identifiant d'objet de l'identité, ni date de connexion. L'absence d'identifiant est ce
 * qui fait de l'adresse la clé d'une personne partout ici — voir `api/src/lib/designationSchemas.ts`.
 */
export interface Account {
  givenName: string
  surname: string
  email: string
}

export interface AccountSearchResult {
  accounts: Account[]
  /** Plus de comptes correspondaient qu'il n'en est rendu : le panneau invite à préciser. */
  truncated: boolean
}

/** La longueur minimale d'une recherche, annoncée par le panneau et exigée par le serveur. */
export const MIN_SEARCH_LENGTH = 2

/** Le nombre de correspondances rendues au maximum, au-delà duquel `truncated` est vrai. */
export const MAX_SEARCH_RESULTS = 20

/**
 * Un POST qui ne crée rien, et c'est délibéré.
 *
 * Le terme cherché est régulièrement une adresse email entière — #157 demande qu'une adresse
 * saisie en entier corresponde exactement — et Application Insights enregistre l'URL complète
 * de chaque requête, chaîne de requête comprise. Un `GET ?q=` classerait donc ces adresses dans
 * la télémétrie à chaque frappe. Le corps, lui, n'y est pas.
 */
export function searchAccounts(q: string): Promise<AccountSearchResult> {
  return apiFetch<AccountSearchResult>('/api/manage/accounts/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q }),
  })
}

export function deleteCommunity(id: string): Promise<void> {
  return apiFetch<void>(`/api/manage/communities/${id}`, { method: 'DELETE' })
}

export function deleteTechnology(id: string): Promise<void> {
  return apiFetch<void>(`/api/manage/technologies/${id}`, { method: 'DELETE' })
}

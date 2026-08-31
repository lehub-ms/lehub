import { ensureFreshToken } from '../auth/authClient'
import type { AuthenticatedUser, SessionPermissions } from '../auth/AuthContext'

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
  /**
   * The parsed error body, when there was one.
   *
   * Most refusals say everything in their `code`. A few carry a value the screen has to put in a
   * sentence — `REFERENCE_IN_USE` carries how many events hold the entry — and reading it off a
   * typed field beats casting the error at the call site.
   */
  readonly body: Record<string, unknown> | null

  /** `status` is 0 when the request never reached the server. */
  constructor(
    message: string,
    status: number,
    code: string | null = null,
    options?: ErrorOptions & { body?: Record<string, unknown> | null },
  ) {
    super(message, options)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.body = options?.body ?? null
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
    let parsed: Record<string, unknown> | null = null
    try {
      const body: unknown = await response.json()
      if (typeof body === 'object' && body !== null) {
        parsed = body as Record<string, unknown>
        if (typeof parsed['code'] === 'string') code = parsed['code']
      }
    } catch {
      // An error without a readable body is still an error; the status carries it.
    }
    throw new ApiError(`L'API a répondu ${response.status}.`, response.status, code, {
      body: parsed,
    })
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** Ce que `POST /api/me/session` renvoie : qui est connecté, et ce que la session peut faire. */
export interface OpenedSession {
  user: AuthenticatedUser
  permissions: SessionPermissions
}

/**
 * Le seul contrôle de forme du transport, et il ne porte que sur les habilitations.
 *
 * `SessionPermissions` est déclaré deux fois — ici et dans `api/src/lib/permissionsRepo.ts` —
 * sans paquet commun pour les tenir ensemble, et `apiFetch` ne pose qu'un `as T` qui ne
 * vérifie rien. Un renommage côté serveur arriverait donc à `hasBackofficeAccess` en
 * `undefined`, donc faux : un administrateur refusé, sans la moindre erreur ni à la
 * compilation ni à l'exécution. Cette fonction est ce qui transforme cette dérive silencieuse
 * en panne bruyante.
 *
 * L'identité n'est délibérément pas contrôlée ici : un nom absent dégrade l'affichage vers
 * « Mon compte » (#97) et n'accorde ni ne refuse rien. Seul ce qui décide mérite d'être vérifié.
 */
function isSessionPermissions(value: unknown): value is SessionPermissions {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { isGlobalAdmin?: unknown; organizedCommunityIds?: unknown }
  return (
    typeof candidate.isGlobalAdmin === 'boolean' &&
    Array.isArray(candidate.organizedCommunityIds) &&
    candidate.organizedCommunityIds.every((id) => typeof id === 'string')
  )
}

/**
 * Ouvre la session côté LeHub : crée la ligne miroir à la première connexion, la rafraîchit
 * ensuite. Le prénom et le nom ne sont transmis que comme repli, pour la fenêtre où le tenant
 * n'a pas encore propagé les siens ; les claims l'emportent toujours côté API.
 *
 * Les habilitations viennent avec, dans la même réponse : la SPA appelle cette route à chaque
 * restauration de session, donc une seconde route pour les relire n'aurait rien à faire de
 * plus. Elles sont par construction celles du dernier chargement, et le serveur arbitre
 * entre-temps.
 */
export async function openSession(
  fallback?: { givenName?: string; surname?: string },
): Promise<OpenedSession> {
  const body = await apiFetch<unknown>('/api/me/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fallback ?? {}),
  })

  const permissions = (body as { permissions?: unknown } | null)?.permissions
  if (!isSessionPermissions(permissions)) {
    // Statut 500 : la réponse est malformée, donc la faute est chez nous et non dans les
    // identifiants. `AuthProvider` traite les 5xx comme une panne serveur et conserve les
    // jetons — une session valide ne doit pas être détruite par notre propre régression.
    throw new ApiError(
      "La réponse de /api/me/session ne porte pas d'habilitations exploitables.",
      500,
      'SESSION_MALFORMED',
    )
  }

  return body as OpenedSession
}

/**
 * Une entité désignée par son nom et sa marque — une communauté, une technologie.
 *
 * Vit ici parce que `EntityAvatar` en dépend et que les deux applications le rendent : le
 * site public dans ses cartes d'évènement, le backoffice dans son sélecteur et ses
 * référentiels.
 */
export interface NamedRef {
  id: string
  name: string
  /** Absolute, composed by the API from the blob path it stores. Null when there is no logo. */
  logoUrl: string | null
  /**
   * Archivée dans le référentiel (#155). Facultatif : `listCommunities` ne le rend pas, seuls
   * les rattachements imbriqués dans un évènement le portent.
   *
   * Une entrée archivée **reste affichée** sur les évènements qui la référencent — c'est tout
   * l'intérêt d'archiver plutôt que de supprimer. Elle cesse seulement d'être *proposée* : voir
   * `deriveFilterOptions` du site public.
   */
  archived?: boolean
}

export interface CommunitySummary {
  id: string
  /**
   * L'adresse lisible de la communauté (#166).
   *
   * L'identifiant reste la clé — de la base comme du contrat d'API, qui n'accepte jamais autre
   * chose. Le slug est une façon d'adresser un écran, pas une seconde identité.
   */
  slug: string
  name: string
  logoUrl: string | null
  description: string | null
}

/**
 * Toutes les communautés référencées. Anonyme, donc lisible par les deux applications : le
 * site public l'affiche en carrousel, le backoffice y puise son sélecteur et le filtre sur
 * les habilitations de la session.
 */
export function listCommunities(): Promise<CommunitySummary[]> {
  return apiFetch<CommunitySummary[]>('/api/communities')
}

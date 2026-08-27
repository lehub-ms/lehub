import { type AuthErrorResponse } from '../lib/authErrors'
import { clearTokens, getAccessToken, getRefreshToken, storeTokens, type IssuedTokens } from './tokenStore'

/**
 * Le client des quatre routes de relais.
 *
 * La SPA ne parle jamais au tenant : ses endpoints n'émettent aucun en-tête CORS, et tout
 * passe par l'API LeHub, qui y ajoute l'identifiant client, les types de challenge et la
 * portée. Ce fichier ne connaît donc que des étapes et des jetons, jamais un tenant.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL

export type AuthRoute = 'signup' | 'signin' | 'reset' | 'token'

/** Ce que le relais laisse passer du tenant. Le libellé brut, lui, s'arrête côté API. */
export interface AuthStepData {
  continuation_token?: string
  challenge_type?: string
  /** L'adresse masquée à laquelle le code est parti, telle que le tenant l'affiche. */
  challenge_target_label?: string
  code_length?: number
  poll_interval?: number
  status?: string
  access_token?: string
  refresh_token?: string
  id_token?: string
  expires_in?: number
}

/**
 * `data` accompagne aussi les refus, et ce n'est pas de la générosité : les codes de contrôle
 * de flux — `credential_required`, `attributes_required`, `verification_required` — arrivent
 * en 400 tout en portant le jeton de continuation de l'étape suivante. Le jeter ferait
 * échouer un parcours qui se déroule normalement.
 */
export type AuthStepResult =
  | { ok: true; data: AuthStepData }
  | { ok: false; error: AuthErrorResponse; data: AuthStepData }

/**
 * Le code que la table de messages associe à « momentanément indisponible ».
 *
 * Fabriqué ici, jamais reçu du tenant : une panne réseau ou un 500 de notre propre API n'est
 * pas un refus fonctionnel, et le repli du parcours de connexion est « Email ou mot de passe
 * incorrect ». Laisser une coupure emprunter ce chemin ferait accuser l'utilisateur d'une
 * faute de frappe pendant une panne.
 */
export const SERVICE_UNAVAILABLE = 'service_unavailable'

const unavailable: AuthStepResult = { ok: false, error: { error: SERVICE_UNAVAILABLE }, data: {} }

export async function postAuthStep(
  route: AuthRoute,
  body: Record<string, unknown>,
): Promise<AuthStepResult> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}/api/auth/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return unavailable
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return unavailable
  }
  if (typeof payload !== 'object' || payload === null) return unavailable

  const record = payload as Record<string, unknown>

  if (response.ok) return { ok: true, data: record }

  // Un refus du tenant porte `error` ; un défaut de notre relais porte `code`. Les seconds
  // ne veulent rien dire pour l'utilisateur et empruntent le message d'indisponibilité.
  if (typeof record['error'] === 'string') {
    return {
      ok: false,
      error: {
        error: record['error'],
        suberror: typeof record['suberror'] === 'string' ? record['suberror'] : null,
      },
      data: record,
    }
  }
  return unavailable
}

/**
 * Les jetons d'une réponse d'étape, quand elle en porte.
 *
 * `null` plutôt qu'une exception : une étape intermédiaire répond légitimement sans jeton,
 * et c'est à l'appelant de savoir s'il en attendait.
 */
export function tokensFrom(data: AuthStepData): IssuedTokens | null {
  if (!data.access_token || typeof data.expires_in !== 'number') return null
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in,
  }
}

/** Échange un jeton de continuation contre des jetons, et ouvre la session. */
export async function completeWithTokens(
  route: Exclude<AuthRoute, 'token'>,
  step: string,
  continuationToken: string,
  grantType?: string,
  extra: Record<string, unknown> = {},
): Promise<AuthStepResult> {
  const result = await postAuthStep(route, {
    step,
    continuation_token: continuationToken,
    ...(grantType ? { grant_type: grantType } : {}),
    ...extra,
  })
  if (!result.ok) return result

  const tokens = tokensFrom(result.data)
  // Une réponse sans erreur et sans jeton là où un jeton était attendu est un échec, pas un
  // succès muet — le relais applique déjà la même règle de son côté.
  if (!tokens) return unavailable

  storeTokens(tokens)
  return result
}

/** Rachète un jeton d'accès. `null` quand le rafraîchissement n'est plus possible. */
export async function renewTokens(refreshToken: string): Promise<IssuedTokens | null> {
  const result = await postAuthStep('token', { step: 'refresh', refresh_token: refreshToken })
  if (!result.ok) return null

  const tokens = tokensFrom(result.data)
  if (!tokens) return null

  storeTokens(tokens)
  return tokens
}

/**
 * Un jeton d'accès utilisable, en renouvelant si besoin. `null` quand la session est finie.
 *
 * Appelée avant chaque requête authentifiée plutôt qu'après un 401 : une requête ne doit pas
 * échouer pour un jeton périmé alors qu'un renouvellement était possible. Le renouvellement
 * en vol est partagé — dix appels concurrents au chargement d'une page ne doivent produire
 * qu'un seul aller-retour, pas dix, dont neuf avec un jeton de rafraîchissement déjà consommé.
 */
let renewalInFlight: Promise<IssuedTokens | null> | null = null

export async function ensureFreshToken(): Promise<string | null> {
  const current = getAccessToken()
  if (current) return current

  const refreshToken = getRefreshToken()
  if (!refreshToken) return null

  renewalInFlight ??= renewTokens(refreshToken).finally(() => {
    renewalInFlight = null
  })

  const tokens = await renewalInFlight
  if (!tokens) {
    // Plus renouvelable : la session est finie, et le dire ici évite de la traîner comme
    // un état connecté fictif jusqu'au prochain échec.
    clearTokens()
    return null
  }
  return tokens.accessToken
}

/**
 * Où vivent les jetons, et pourquoi là.
 *
 * L'arbitrage est explicite parce qu'il est réel : hérité par défaut, il est presque
 * toujours mauvais dans un sens ou dans l'autre.
 *
 * **Le jeton d'accès et sa date d'expiration restent en mémoire.** Ils ne survivent pas à
 * un rechargement, ce qui n'a aucun coût — ils se rachètent en un appel avec le jeton de
 * rafraîchissement — et ce qui retire du stockage du navigateur la seule valeur qui ouvre
 * immédiatement l'API.
 *
 * **Le jeton de rafraîchissement va dans `localStorage`**, et c'est le point qui se discute.
 *
 * Contre : une injection de script y accède. Pour : la politique de sécurité de contenu
 * servie par les deux Static Web Apps est `script-src 'self'` sans `unsafe-inline`, sans CDN
 * et sans `eval` ; il n'y a pas de point d'entrée pour un script tiers, et React échappe ses
 * rendus. Le risque n'est pas nul, il est étroit.
 *
 * Et surtout, les deux critères de la story tranchent le reste. « Ne pas ressaisir ses
 * identifiants à chaque visite » exige de survivre à la fermeture du navigateur, ce que
 * `sessionStorage` ne fait pas. « Une déconnexion dans un onglet ne laisse pas l'autre dans
 * un état connecté fictif » exige un canal entre onglets, et `sessionStorage` est cloisonné
 * par onglet : l'évènement `storage` de `localStorage` est précisément ce canal.
 *
 * Un cookie `HttpOnly` serait plus sûr que les deux, et n'est pas disponible ici : l'API est
 * sur une autre origine et sa CORS est déclarée `supportCredentials: false`.
 */

/** Le préfixe évite d'entrer en collision avec ce que d'autres outils écrivent sur l'origine. */
const REFRESH_TOKEN_KEY = 'lehub.auth.refreshToken'

/**
 * Marge prise sur l'expiration annoncée. Le renouvellement part avant que le jeton ne meure,
 * pas après qu'une requête a échoué — c'est ce que demande la story, et c'est aussi ce qui
 * absorbe le décalage d'horloge entre le poste et le tenant.
 */
export const RENEWAL_MARGIN_MS = 60_000

interface AccessSession {
  accessToken: string
  /** Horodatage absolu, en millisecondes, pas une durée : une durée se périme au repos. */
  expiresAt: number
}

let accessSession: AccessSession | null = null

/** `localStorage` peut lever — navigation privée, quota, réglages qui bloquent le stockage. */
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Une session qui ne survit pas au rechargement reste une session utilisable ; une
    // exception ici rendrait la page blanche, ce qui ne l'est pas.
  }
}

export function getAccessToken(): string | null {
  if (!accessSession) return null
  return accessSession.expiresAt <= Date.now() ? null : accessSession.accessToken
}

/** Quand renouveler, en millisecondes à partir de maintenant. Négatif si c'est déjà tard. */
export function millisecondsBeforeRenewal(): number | null {
  if (!accessSession) return null
  return accessSession.expiresAt - RENEWAL_MARGIN_MS - Date.now()
}

export function getRefreshToken(): string | null {
  return readStorage(REFRESH_TOKEN_KEY)
}

export interface IssuedTokens {
  accessToken: string
  refreshToken: string | null
  /** Durée de vie annoncée par le tenant, en secondes. */
  expiresIn: number
}

export function storeTokens(tokens: IssuedTokens): void {
  accessSession = {
    accessToken: tokens.accessToken,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
  }
  // Un renouvellement qui ne renvoie pas de nouveau jeton de rafraîchissement laisse
  // l'ancien en place : le remplacer par `null` déconnecterait à la place de prolonger.
  if (tokens.refreshToken) writeStorage(REFRESH_TOKEN_KEY, tokens.refreshToken)
}

/**
 * Un seul canal pour « il n'y a plus de session », quelle qu'en soit la cause : déconnexion
 * explicite, renouvellement impossible, ou disparition du jeton dans un autre onglet. Trois
 * mécanismes distincts finiraient par en oublier un.
 */
const cleared = new Set<() => void>()

export function onTokensCleared(listener: () => void): () => void {
  cleared.add(listener)
  return () => {
    cleared.delete(listener)
  }
}

export function clearTokens(): void {
  accessSession = null
  writeStorage(REFRESH_TOKEN_KEY, null)
  for (const listener of cleared) listener()
}

/**
 * Prévient quand le jeton de rafraîchissement change dans un *autre* onglet.
 *
 * `storage` ne se déclenche que sur les autres onglets de la même origine, jamais sur celui
 * qui écrit — c'est exactement le signal voulu : « quelqu'un d'autre s'est déconnecté ».
 */
export function onRefreshTokenChangedElsewhere(listener: (token: string | null) => void): () => void {
  const handler = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== REFRESH_TOKEN_KEY) return
    // `key === null` signale un `clear()` global : tout a disparu, y compris le nôtre.
    listener(event.key === null ? null : event.newValue)
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

/** Réservé aux tests : remet la mémoire du module à zéro entre deux cas. */
export function resetTokenStoreForTests(): void {
  accessSession = null
}

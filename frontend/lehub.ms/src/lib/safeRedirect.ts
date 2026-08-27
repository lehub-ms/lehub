/**
 * La destination demandée avant une connexion, ou l'accueil.
 *
 * Une destination qui n'est pas un chemin interne est ignorée. `//evil.example` en est une :
 * le navigateur la lit comme une URL absolue sur un autre hôte, et une redirection ouverte
 * après authentification est exactement ce qu'un hameçonnage cherche à obtenir.
 */
export function safeRedirect(candidate: unknown, fallback: string): string {
  if (typeof candidate !== 'string') return fallback
  if (!candidate.startsWith('/')) return fallback
  if (candidate.startsWith('//')) return fallback
  // `/\` est lu comme `//` par certains navigateurs, et mène au même contournement.
  if (candidate.startsWith('/\\')) return fallback
  return candidate
}

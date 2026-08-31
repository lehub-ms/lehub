import { vi } from 'vitest'
import type { SessionPermissions } from '@lehub/shared/auth/AuthContext'
import {
  ADMIN_COMMUNITIES,
  ADMIN_TECHNOLOGIES,
  COMMUNITIES,
  openedSession,
} from './session-fixtures'

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * Une session déjà ouverte, restaurée depuis le jeton de rafraîchissement du stockage.
 *
 * Partagé entre les suites plutôt que recopié : c'est la seule façon de monter l'application
 * derrière ses gardes, et deux copies finiraient par diverger sur ce que rend `/api/me/session`.
 */
/**
 * Une réponse à substituer pour les URL contenant une clé donnée. Reçoit le rang de l'appel, à
 * partir de 1, pour qu'un test puisse échouer une fois puis réussir — c'est ce que « réessayer »
 * demande de vérifier.
 */
export type FetchOverrides = Record<string, (attempt: number) => Response>

export function stubSignedIn(
  permissions: SessionPermissions,
  overrides: FetchOverrides = {},
): void {
  window.localStorage.setItem('lehub.auth.refreshToken', 'rt')
  const attempts: Record<string, number> = {}
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      // Les substitutions passent avant tout le reste : un test qui veut voir une lecture
      // échouer ne doit pas avoir à redéclarer les branches qu'il ne change pas.
      for (const [fragment, respond] of Object.entries(overrides)) {
        if (url.includes(fragment)) {
          attempts[fragment] = (attempts[fragment] ?? 0) + 1
          return Promise.resolve(respond(attempts[fragment]))
        }
      }
      if (url.includes('/api/auth/token')) {
        return Promise.resolve(jsonResponse({ access_token: 'at', refresh_token: 'rt2', expires_in: 3600 }))
      }
      // Avant `/api/communities`, qui ne les attraperait pas — les chemins diffèrent — mais
      // dont la proximité invite à s'y tromper en ajoutant une branche.
      if (url.includes('/api/admin/communities')) {
        return Promise.resolve(jsonResponse(ADMIN_COMMUNITIES))
      }
      if (url.includes('/api/admin/technologies')) {
        return Promise.resolve(jsonResponse(ADMIN_TECHNOLOGIES))
      }
      // La coquille lit la liste des communautés dès qu'elle se monte : sans elle, chaque
      // suite qui traverse une garde recevrait la session en guise de tableau.
      if (url.includes('/api/communities')) return Promise.resolve(jsonResponse(COMMUNITIES))
      return Promise.resolve(jsonResponse(openedSession(permissions)))
    }),
  )
}

import { vi } from 'vitest'
import type { SessionPermissions } from '@lehub/shared/auth/AuthContext'
import { openedSession } from './session-fixtures'

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * Une session déjà ouverte, restaurée depuis le jeton de rafraîchissement du stockage.
 *
 * Partagé entre les suites plutôt que recopié : c'est la seule façon de monter l'application
 * derrière ses gardes, et deux copies finiraient par diverger sur ce que rend `/api/me/session`.
 */
export function stubSignedIn(permissions: SessionPermissions): void {
  window.localStorage.setItem('lehub.auth.refreshToken', 'rt')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/api/auth/token')
          ? jsonResponse({ access_token: 'at', refresh_token: 'rt2', expires_in: 3600 })
          : jsonResponse(openedSession(permissions)),
      ),
    ),
  )
}

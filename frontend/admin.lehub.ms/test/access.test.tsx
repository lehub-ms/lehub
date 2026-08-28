import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PATHS } from '@/lib/navigation'
import { renderAt } from './support/render-route'
import { GLOBAL_ADMIN, ORDINARY_USER, ORGANIZER, openedSession } from './support/session-fixtures'
import type { SessionPermissions } from '@shared/auth/AuthContext'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Une session déjà ouverte, restaurée depuis le jeton de rafraîchissement du stockage. */
function stubSignedIn(permissions: SessionPermissions) {
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

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('accès au backoffice', () => {
  it('renvoie un visiteur non connecté vers la connexion, et retient la page demandée', async () => {
    const { router } = renderAt('/')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.signIn)
    })
    // La destination voyage dans l'état de navigation, jamais dans l'URL : elle n'a pas à
    // être partageable.
    expect(router.state.location.state).toEqual({ from: '/' })
    expect(await screen.findByRole('heading', { name: /console de gestion/i })).toBeTruthy()
  })

  it('retient aussi un lien profond, pas seulement la racine', async () => {
    const { router } = renderAt('/une-section?filtre=azure')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.signIn)
    })
    expect(router.state.location.state).toEqual({ from: '/une-section?filtre=azure' })
  })

  it("montre l'écran d'absence d'accès à un compte connecté sans habilitation", async () => {
    stubSignedIn(ORDINARY_USER)
    const { router } = renderAt('/')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.noAccess)
    })
    // Ni page vide, ni boucle de connexion : il est connecté, il n'a pas accès, il sait à
    // qui s'adresser.
    expect(screen.getByRole('heading', { name: /n’avez pas accès/i })).toBeTruthy()
    // Il sait à qui s'adresser : la marche à suivre est écrite, pas seulement le refus.
    expect(screen.getByText(/L’accès se demande à un administrateur/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /se déconnecter/i })).toBeTruthy()
  })

  it('ne laisse rien filtrer de la page visée par un lien profond non habilité', async () => {
    stubSignedIn(ORDINARY_USER)
    renderAt('/une-section')

    expect(await screen.findByRole('heading', { name: /n’avez pas accès/i })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /page introuvable/i })).toBeNull()
  })

  it('laisse entrer un organisateur', async () => {
    stubSignedIn(ORGANIZER)
    const { router } = renderAt('/')

    expect(await screen.findByRole('heading', { name: /bonjour/i })).toBeTruthy()
    expect(router.state.location.pathname).toBe(PATHS.home)
  })

  it('laisse entrer un administrateur global, même sans communauté', async () => {
    stubSignedIn(GLOBAL_ADMIN)
    const { router } = renderAt('/')

    expect(await screen.findByRole('heading', { name: /bonjour/i })).toBeTruthy()
    expect(router.state.location.pathname).toBe(PATHS.home)
  })

  it("n'expose aucun parcours d'inscription", async () => {
    renderAt(PATHS.signIn)

    await screen.findByRole('heading', { name: /console de gestion/i })
    expect(screen.queryByRole('link', { name: /créer un compte/i })).toBeNull()
    // Le compte se crée sur le site public, et l'écran le dit.
    expect(screen.getByRole('link', { name: 'lehub.ms' })).toBeTruthy()
  })

  it('atteint la réinitialisation de mot de passe sans session', async () => {
    renderAt(PATHS.resetPassword)

    expect(await screen.findByRole('heading', { name: /mot de passe oublié/i })).toBeTruthy()
  })
})

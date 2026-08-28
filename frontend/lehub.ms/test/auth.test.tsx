import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../src/auth/AuthProvider'
import { ensureFreshToken, postAuthStep, SERVICE_UNAVAILABLE } from '../src/auth/authClient'
import { useAuth } from '../src/auth/useAuth'
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  millisecondsBeforeRenewal,
  onTokensCleared,
  resetTokenStoreForTests,
  storeTokens,
} from '../src/auth/tokenStore'
import { openedSession } from './support/session-fixtures'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  resetTokenStoreForTests()
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetTokenStoreForTests()
  window.localStorage.clear()
})

describe('tokenStore', () => {
  it("garde le jeton d'accès en mémoire et le jeton de rafraîchissement sur le disque", () => {
    storeTokens({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3600 })

    expect(getAccessToken()).toBe('at')
    expect(getRefreshToken()).toBe('rt')
    // Ce qui ouvre l'API immédiatement ne traîne pas dans le stockage du navigateur.
    expect(JSON.stringify(window.localStorage)).not.toContain('at')
  })

  it("ne rend plus un jeton d'accès périmé", () => {
    storeTokens({ accessToken: 'at', refreshToken: 'rt', expiresIn: -1 })
    expect(getAccessToken()).toBeNull()
    // Le jeton de rafraîchissement, lui, reste : c'est avec lui qu'on repart.
    expect(getRefreshToken()).toBe('rt')
  })

  it("programme le renouvellement avant l'expiration, pas après", () => {
    storeTokens({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3600 })
    const delay = millisecondsBeforeRenewal()
    expect(delay).not.toBeNull()
    expect(delay!).toBeLessThan(3600 * 1000)
    expect(delay!).toBeGreaterThan(3500 * 1000)
  })

  it("conserve le jeton de rafraîchissement quand un renouvellement n'en renvoie pas", () => {
    storeTokens({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3600 })
    storeTokens({ accessToken: 'at2', refreshToken: null, expiresIn: 3600 })
    // Le remplacer par null déconnecterait au lieu de prolonger.
    expect(getRefreshToken()).toBe('rt')
    expect(getAccessToken()).toBe('at2')
  })

  it('efface tout et prévient par un canal unique', () => {
    const listener = vi.fn()
    const unsubscribe = onTokensCleared(listener)
    storeTokens({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3600 })

    clearTokens()

    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})

describe('postAuthStep', () => {
  it("rend le couple error / suberror d'un refus du tenant", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: 'invalid_grant', suberror: 'password_banned' }, 400),
    ))

    const result = await postAuthStep('signup', { step: 'continue' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toEqual({ error: 'invalid_grant', suberror: 'password_banned' })
  })

  it("traduit une panne en code d'indisponibilité, jamais en refus fonctionnel", async () => {
    for (const failure of [
      () => Promise.reject(new TypeError('network')),
      () => Promise.resolve(jsonResponse({ code: 'ENTRA_NOT_CONFIGURED' }, 500)),
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(failure))
      const result = await postAuthStep('signin', { step: 'start' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      // Sans ce code, une coupure emprunterait le repli du parcours de connexion et
      // accuserait l'utilisateur d'une faute de frappe.
      expect(result.error.error).toBe(SERVICE_UNAVAILABLE)
    }
  })
})

describe('ensureFreshToken', () => {
  it('renouvelle quand le jeton est périmé, et rend le nouveau', async () => {
    storeTokens({ accessToken: 'vieux', refreshToken: 'rt', expiresIn: -1 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ access_token: 'neuf', refresh_token: 'rt2', expires_in: 3600 }),
    ))

    expect(await ensureFreshToken()).toBe('neuf')
    expect(getRefreshToken()).toBe('rt2')
  })

  it("ne renouvelle qu'une fois pour des appels concurrents", async () => {
    storeTokens({ accessToken: 'vieux', refreshToken: 'rt', expiresIn: -1 })
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ access_token: 'neuf', refresh_token: 'rt2', expires_in: 3600 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const results = await Promise.all([ensureFreshToken(), ensureFreshToken(), ensureFreshToken()])

    // Trois allers-retours consommeraient trois fois le même jeton de rafraîchissement,
    // dont deux déjà invalidés.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(results).toEqual(['neuf', 'neuf', 'neuf'])
  })

  it("clôt la session quand le renouvellement n'est plus possible", async () => {
    storeTokens({ accessToken: 'vieux', refreshToken: 'rt', expiresIn: -1 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'invalid_grant' }, 400)))

    expect(await ensureFreshToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('renouvelle sur demande même quand le jeton courant est encore valable', async () => {
    // Le cas du minuteur : à T-60 s le jeton est encore bon, donc sans ce forçage la fonction
    // le rendrait tel quel et le renouvellement anticipé n'aurait jamais lieu — il se
    // produirait à l'expiration, c'est-à-dire trop tard.
    storeTokens({ accessToken: 'encore-bon', refreshToken: 'rt', expiresIn: 3600 })
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ access_token: 'neuf', refresh_token: 'rt2', expires_in: 3600 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    expect(await ensureFreshToken()).toBe('encore-bon')
    expect(fetchMock).not.toHaveBeenCalled()

    expect(await ensureFreshToken(true)).toBe('neuf')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("ne déconnecte pas pour un renouvellement raté tant que le jeton courant vit", async () => {
    storeTokens({ accessToken: 'encore-bon', refreshToken: 'rt', expiresIn: 3600 })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))

    // Une coupure passagère à T-60 s ne doit pas être plus brutale que la panne elle-même.
    expect(await ensureFreshToken(true)).toBe('encore-bon')
    expect(getRefreshToken()).toBe('rt')
  })

  it("n'appelle rien quand personne n'est connecté", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await ensureFreshToken()).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

function Probe(): React.ReactNode {
  const { state, signOut } = useAuth()
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      <span data-testid="identity">
        {state.status === 'authenticated' && state.user ? state.user.givenName : '—'}
      </span>
      <button type="button" onClick={signOut}>
        Se déconnecter
      </button>
    </div>
  )
}

describe('AuthProvider', () => {
  it("part de l'état déconnecté sans jamais passer par le chargement quand rien n'est stocké", () => {
    vi.stubGlobal('fetch', vi.fn())
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    // Passer par « loading » ferait clignoter la navigation à chaque visite anonyme.
    expect(screen.getByTestId('status').textContent).toBe('anonymous')
  })

  it('restaure une session au chargement à partir du seul jeton de rafraîchissement', async () => {
    window.localStorage.setItem('lehub.auth.refreshToken', 'rt')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          url.includes('/api/auth/token')
            ? jsonResponse({ access_token: 'at', refresh_token: 'rt2', expires_in: 3600 })
            : jsonResponse(openedSession()),
        ),
      ),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))
    expect(screen.getByTestId('identity').textContent).toBe('Ada')
  })

  it("reste connecté sans identité affichable quand le miroir refuse des claims incomplets", async () => {
    window.localStorage.setItem('lehub.auth.refreshToken', 'rt')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          url.includes('/api/auth/token')
            ? jsonResponse({ access_token: 'at', refresh_token: 'rt2', expires_in: 3600 })
            : jsonResponse({ code: 'INCOMPLETE_IDENTITY' }, 409),
        ),
      ),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    // L'utilisateur détient bel et bien ses jetons : le renvoyer au formulaire serait pire.
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))
    expect(screen.getByTestId('identity').textContent).toBe('—')
  })

  it('revient proprement à déconnecté quand le jeton stocké est mort', async () => {
    window.localStorage.setItem('lehub.auth.refreshToken', 'perime')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'invalid_grant' }, 400)))

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'))
    expect(getRefreshToken()).toBeNull()
  })

  it("efface tout l'état d'authentification à la déconnexion", async () => {
    window.localStorage.setItem('lehub.auth.refreshToken', 'rt')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          url.includes('/api/auth/token')
            ? jsonResponse({ access_token: 'at', refresh_token: 'rt2', expires_in: 3600 })
            : jsonResponse(openedSession()),
        ),
      ),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))

    await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }))

    expect(screen.getByTestId('status').textContent).toBe('anonymous')
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('renouvelle une seule fois avant expiration, sans tourner en boucle', async () => {
    vi.useFakeTimers()
    window.localStorage.setItem('lehub.auth.refreshToken', 'rt')
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/api/auth/token')
          ? // 90 s de durée de vie : la marge de renouvellement est de 60 s, donc le minuteur
            // doit partir à T+30 s puis se taire jusqu'au suivant.
            jsonResponse({ access_token: 'at', refresh_token: 'rt2', expires_in: 90 })
          : jsonResponse(openedSession()),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await vi.advanceTimersByTimeAsync(0)
    const afterRestore = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/auth/token')).length

    await vi.advanceTimersByTimeAsync(40_000)
    const renewals = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/auth/token')).length

    // Le défaut à ne pas rejouer : un `setTimeout(…, 0)` qui se reprogramme lui-même pendant
    // toute la dernière minute du jeton, soit des centaines d'appels par seconde.
    expect(renewals - afterRestore).toBeLessThanOrEqual(2)
    expect(renewals).toBeGreaterThan(afterRestore)
    vi.useRealTimers()
  })

  it("ne reste pas connecté pour la forme quand un autre onglet se déconnecte", async () => {
    window.localStorage.setItem('lehub.auth.refreshToken', 'rt')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          url.includes('/api/auth/token')
            ? jsonResponse({ access_token: 'at', refresh_token: 'rt2', expires_in: 3600 })
            : jsonResponse(openedSession()),
        ),
      ),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))

    // `storage` ne se déclenche que sur les *autres* onglets : c'est exactement le signal.
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'lehub.auth.refreshToken', newValue: null }),
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'))
  })
})

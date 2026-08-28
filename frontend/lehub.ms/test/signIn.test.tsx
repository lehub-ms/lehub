import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { safeRedirect } from '@/lib/safeRedirect'
import { PATHS } from '@/lib/navigation'
import { renderAt } from './support/render-route'
import { openedSession } from './support/session-fixtures'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Les trois étapes d'une connexion réussie, puis l'ouverture de session. */
function stubSuccessfulSignIn() {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/api/me/session')) return Promise.resolve(jsonResponse(openedSession()))
    const body = typeof init?.body === 'string' ? init.body : '{}'
    const step = (JSON.parse(body) as { step?: string }).step
    if (step === 'token') {
      return Promise.resolve(
        jsonResponse({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
      )
    }
    return Promise.resolve(jsonResponse({ continuation_token: 'ct' }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Adresse email'), 'ada@example.test')
  await user.type(screen.getByLabelText('Mot de passe'), 'Correct-Horse-8')
  await user.click(screen.getByRole('button', { name: /^me connecter$/i }))
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('safeRedirect', () => {
  it('accepte un chemin interne', () => {
    expect(safeRedirect('/evenements', '/')).toBe('/evenements')
  })

  it('ignore toute destination hors du site', () => {
    // `//evil.example` est lu par le navigateur comme une URL absolue sur un autre hôte :
    // une redirection ouverte après authentification est ce qu'un hameçonnage vise.
    for (const candidate of [
      '//evil.example',
      '/\\evil.example',
      'https://evil.example',
      'evenements',
      null,
      undefined,
      42,
    ]) {
      expect(safeRedirect(candidate, '/'), String(candidate)).toBe('/')
    }
  })
})

describe('page de connexion', () => {
  it('authentifie sans jamais rediriger vers une interface Microsoft', async () => {
    const user = userEvent.setup()
    const fetchMock = stubSuccessfulSignIn()

    const { router } = renderAt(PATHS.signIn)
    await fillAndSubmit(user)

    await waitFor(() => expect(router.state.location.pathname).toBe(PATHS.home))
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain('ciamlogin.com')
    }
  })

  it("revient à la destination demandée avant la connexion", async () => {
    const user = userEvent.setup()
    stubSuccessfulSignIn()

    const { router } = renderAt(PATHS.signIn)
    await router.navigate(PATHS.signIn, { state: { from: PATHS.events }, replace: true })
    await fillAndSubmit(user)

    await waitFor(() => expect(router.state.location.pathname).toBe(PATHS.events))
  })

  it('nomme la cause du refus dans le vocabulaire de la connexion', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        const body = typeof init?.body === 'string' ? init.body : '{}'
        const step = (JSON.parse(body) as { step?: string }).step
        return Promise.resolve(
          step === 'token'
            ? jsonResponse({ error: 'invalid_grant' }, 400)
            : jsonResponse({ continuation_token: 'ct' }),
        )
      }),
    )

    renderAt(PATHS.signIn)
    await fillAndSubmit(user)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Email ou mot de passe incorrect.')
  })

  it("ne parle pas d'identifiants incorrects quand c'est l'API qui est tombée", async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))

    renderAt(PATHS.signIn)
    await fillAndSubmit(user)

    const alert = await screen.findByRole('alert')
    // Accuser l'utilisateur d'une faute de frappe pendant une panne est le piège à éviter.
    expect(alert.textContent).not.toContain('Email ou mot de passe incorrect')
    expect(alert.textContent).toContain('momentanément indisponible')
  })

  it("ne fige pas le formulaire quand l'ouverture de session côté LeHub échoue", async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        // Le cas réel : l'Azure SQL serverless de dev sort de sa mise en veille de 60 minutes.
        if (url.includes('/api/me/session')) {
          return Promise.resolve(jsonResponse({ code: 'SESSION_MIRROR_ERROR' }, 500))
        }
        const body = typeof init?.body === 'string' ? init.body : '{}'
        const step = (JSON.parse(body) as { step?: string }).step
        return Promise.resolve(
          step === 'token'
            ? jsonResponse({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 })
            : jsonResponse({ continuation_token: 'ct' }),
        )
      }),
    )

    renderAt(PATHS.signIn)
    await fillAndSubmit(user)

    // Sans filet, le bouton resterait désactivé sur « Connexion en cours… », sans message,
    // devant un utilisateur que `completeSignIn` vient de déconnecter silencieusement.
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('momentanément indisponible')
    expect(screen.getByRole('button', { name: /^me connecter$/i }).hasAttribute('disabled')).toBe(false)
  })

  it('efface le message au premier caractère saisi ensuite', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'user_not_found' }, 400)))

    renderAt(PATHS.signIn)
    await fillAndSubmit(user)
    expect(await screen.findByRole('alert')).not.toBeNull()

    await user.type(screen.getByLabelText('Adresse email'), 'x')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('propose le parcours de mot de passe oublié et la création de compte', () => {
    vi.stubGlobal('fetch', vi.fn())
    renderAt(PATHS.signIn)

    expect(
      screen.getByRole('link', { name: /mot de passe oublié/i }).getAttribute('href'),
    ).toBe(PATHS.resetPassword)
    expect(screen.getByRole('link', { name: /créer un compte/i }).getAttribute('href')).toBe(
      PATHS.signUp,
    )
  })
})

describe('point d’entrée « Me connecter » de la navigation', () => {
  it('mène à la page de connexion, sur desktop comme dans le repli mobile', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    vi.stubGlobal('fetch', vi.fn())
    renderAt(PATHS.home)

    const links = screen.getAllByRole('link', { name: 'Me connecter' })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.getAttribute('href')).toBe(PATHS.signIn)
      expect(link.className).toContain('min-h-11')
    }

    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }))
    const dialog = await screen.findByRole('dialog')
    const inDrawer = within(dialog).getByRole('link', { name: 'Me connecter' })
    expect(inDrawer.getAttribute('href')).toBe(PATHS.signIn)
  })
})

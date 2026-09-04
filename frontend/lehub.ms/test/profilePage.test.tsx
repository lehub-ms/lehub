import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderAt } from './support/render-route'
import { buildNamedRef } from './support/event-fixtures'
import { openedSession } from './support/session-fixtures'
import { PATHS } from '@/lib/navigation'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const PARIS = buildNamedRef('community', 1)
const DOTNET = buildNamedRef('technology', 1)

function stubApi(
  preferences: unknown = { saved: false, communities: [], technologies: [] },
  { signedIn = true } = {},
) {
  if (signedIn) window.localStorage.setItem('lehub.auth.refreshToken', 'rt')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/token')) {
        return Promise.resolve(
          jsonResponse({ access_token: 'at', refresh_token: 'rt2', expires_in: 3600 }),
        )
      }
      if (url.includes('/api/me/session')) return Promise.resolve(jsonResponse(openedSession()))
      if (url.includes('/api/me/preferences')) return Promise.resolve(jsonResponse(preferences))
      return Promise.resolve(jsonResponse([]))
    }),
  )
}

function card(): HTMLElement {
  return screen.getByRole('region', { name: 'Mes préférences' })
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('page de profil', () => {
  it('renvoie un visiteur vers la connexion', async () => {
    stubApi(undefined, { signedIn: false })
    const { router } = renderAt(PATHS.profile)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.signIn)
    })
  })

  it('refuse une casse ou une barre oblique qui ne sont pas les siennes', async () => {
    stubApi()
    renderAt('/PROFIL')

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 }).textContent).not.toBe('Mon profil')
    })
  })
})

describe('carte « Mes préférences » du profil', () => {
  it('dit où régler la sélection quand rien n’est enregistré', async () => {
    stubApi({ saved: false, communities: [], technologies: [] })
    renderAt(PATHS.profile)

    await waitFor(() => {
      expect(within(card()).getByText(/Aucune préférence enregistrée/)).not.toBeNull()
    })
    // Ce qui est proscrit tant que la Feature iCal n'est pas livrée, c'est le **lien** : pas de
    // bouton mort, pas de ligne vide, pas de copie, pas de régénération. Le mot « agenda » lui-même
    // reste dit — #193 impose d'ailleurs « les agendas déjà abonnés » dans sa confirmation.
    expect(card().textContent).not.toMatch(/lien d’agenda|lien d'agenda|copier|régénérer/i)
  })

  it('affiche « Tous les évènements » pour une sélection enregistrée vide', async () => {
    // Et non une liste vide, qui laisserait croire à une perte de données.
    stubApi({ saved: true, communities: [], technologies: [] })
    renderAt(PATHS.profile)

    await waitFor(() => {
      expect(within(card()).getByText('Tous les évènements')).not.toBeNull()
    })
    expect(within(card()).queryByText(/Aucune préférence enregistrée/)).toBeNull()
  })

  it('liste les entrées suivies, par dimension', async () => {
    stubApi({ saved: true, communities: [PARIS], technologies: [DOTNET] })
    renderAt(PATHS.profile)

    await waitFor(() => {
      expect(within(card()).getByText('Communautés')).not.toBeNull()
    })
    expect(within(card()).getByText(PARIS.name)).not.toBeNull()
    expect(within(card()).getByText('Technologies')).not.toBeNull()
    expect(within(card()).getByText(DOTNET.name)).not.toBeNull()
  })

  it('affiche encore une entrée archivée plutôt que de laisser un trou', async () => {
    const archived = { ...PARIS, archived: true }
    stubApi({ saved: true, communities: [archived], technologies: [] })
    renderAt(PATHS.profile)

    await waitFor(() => {
      expect(within(card()).getByText(PARIS.name)).not.toBeNull()
    })
    expect(within(card()).getByText('(archivée)')).not.toBeNull()
  })

  it('ne rend aucun contrôle de modification, seulement un lien vers les évènements', async () => {
    stubApi({ saved: true, communities: [PARIS], technologies: [] })
    renderAt(PATHS.profile)

    await waitFor(() => {
      expect(within(card()).getByText(PARIS.name)).not.toBeNull()
    })

    // La sélection se règle à un seul endroit. Deux mécanismes finiraient par diverger.
    expect(within(card()).queryAllByRole('button')).toHaveLength(0)
    expect(within(card()).queryAllByRole('checkbox')).toHaveLength(0)

    const link = within(card()).getByRole('link', { name: /Modifier sur la page Évènements/ })
    expect(link.getAttribute('href')).toBe(PATHS.events)
  })
})

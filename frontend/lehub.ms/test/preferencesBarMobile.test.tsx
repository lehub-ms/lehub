import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderAt } from './support/render-route'
import { buildEvent, buildNamedRef } from './support/event-fixtures'
import { openedSession } from './support/session-fixtures'
import {
  resetViewport,
  setNarrowViewport,
  triggerFooterOverlap,
  triggerResizeObservers,
} from './setup'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const PARIS = buildNamedRef('community', 1)
const LYON = buildNamedRef('community', 2)
const EVENTS = [
  buildEvent({ id: 'e1', title: 'Journée Paris', communities: [PARIS], technologies: [] }),
  buildEvent({ id: 'e2', title: 'Journée Lyon', communities: [LYON], technologies: [] }),
]

function stubApi(preferences: unknown = { saved: false, communities: [], technologies: [] }) {
  window.localStorage.setItem('lehub.auth.refreshToken', 'rt')
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
      if (url.includes('/api/events')) return Promise.resolve(jsonResponse(EVENTS))
      return Promise.resolve(jsonResponse({}, 404))
    }),
  )
}

function bar(): HTMLElement {
  return screen.getByRole('region', { name: 'Mes préférences' })
}

/** La poignée n'existe que sous le seuil — c'est précisément ce que plusieurs cas vérifient. */
function handle(): HTMLElement | null {
  return within(bar()).queryByRole('button', { expanded: true }) ??
    within(bar()).queryByRole('button', { expanded: false })
}

const user = userEvent.setup({ pointerEventsCheck: 0 })

async function renderEvents() {
  renderAt('/evenements')
  await waitFor(() => {
    expect(screen.getByRole('region', { name: 'Mes préférences' })).not.toBeNull()
  })
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
  resetViewport()
})

describe('encart de préférences sous 1024px', () => {
  it('ancre la barre en bas de la fenêtre', async () => {
    setNarrowViewport(true)
    stubApi()
    await renderEvents()

    expect(bar().className).toContain('fixed')
    // Sous le voile du tiroir de filtres (z-290) et son contenu (z-300), pour qu'un tiroir
    // ouvert passe au-dessus de l'encart et non dessous.
    expect(bar().className).toContain('z-[280]')
  })

  it('se relève du recouvrement du pied de page', async () => {
    setNarrowViewport(true)
    stubApi()
    await renderEvents()

    act(() => {
      triggerFooterOverlap(120)
    })

    await waitFor(() => {
      expect(bar().style.bottom).toBe('120px')
    })
  })

  it('réserve sa hauteur pour qu’aucun évènement ne reste masqué', async () => {
    setNarrowViewport(true)
    stubApi()
    await renderEvents()

    // jsdom ne calcule aucune mise en page : la hauteur vient d'ici, et le composant la relaie.
    bar().getBoundingClientRect = () => ({ height: 96 }) as DOMRect
    act(() => {
      triggerResizeObservers()
    })

    await waitFor(() => {
      expect(screen.getByTestId('preferences-bar-spacer').style.height).toBe('96px')
    })
  })

  it('se replie par une poignée dont le libellé reprend l’état', async () => {
    setNarrowViewport(true)
    stubApi({ saved: true, communities: [PARIS], technologies: [] })
    await renderEvents()

    const trigger = handle()
    expect(trigger).not.toBeNull()
    // Replié, l'encart doit encore dire de quoi il s'agit et s'il y a quelque chose à enregistrer.
    expect(trigger?.textContent).toContain('Mes préférences appliquées')
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')

    await user.click(trigger as HTMLElement)

    await waitFor(() => {
      expect(handle()?.getAttribute('aria-expanded')).toBe('false')
    })
  })

  it('annonce la divergence jusque sur la poignée repliée', async () => {
    setNarrowViewport(true)
    stubApi({ saved: true, communities: [PARIS], technologies: [] })
    await renderEvents()

    await user.click(screen.getByRole('checkbox', { name: /community 2/i }))

    expect(handle()?.textContent).toContain('Filtres modifiés — non enregistré')
  })
})

describe('barre de préférences au-delà de 1024px', () => {
  it('reste dans le flux et ne rend aucune poignée', async () => {
    setNarrowViewport(false)
    stubApi()
    await renderEvents()

    expect(bar().className).not.toContain('fixed')
    // « Aucune poignée n'est rendue » — pas seulement masquée.
    expect(handle()).toBeNull()
    expect(screen.queryByTestId('preferences-bar-spacer')).toBeNull()
  })
})

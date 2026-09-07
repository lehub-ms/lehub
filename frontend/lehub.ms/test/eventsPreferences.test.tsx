import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderAt } from './support/render-route'
import { buildEvent, buildNamedRef } from './support/event-fixtures'
import { openedSession } from './support/session-fixtures'

/**
 * Les préférences passent par la vraie couche réseau plutôt que par un mock de `@/lib/api` :
 * l'adresse, le verbe et la forme de la réponse font partie de ce que #192 doit garantir, et un
 * module bouchonné les rendrait tous les trois invérifiables.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface StubOptions {
  signedIn?: boolean
  events?: unknown[]
  /** Ce que `GET /api/me/preferences` répond. Une promesse permet de le faire attendre. */
  preferences?: unknown
  preferencesStatus?: number
}

/** Les appels observés, pour pouvoir assertionner ce qui n'a *pas* été demandé. */
let calls: string[] = []

function stubApi({
  signedIn = true,
  events = [],
  preferences = { saved: false, communities: [], technologies: [] },
  preferencesStatus = 200,
}: StubOptions = {}) {
  if (signedIn) window.localStorage.setItem('lehub.auth.refreshToken', 'rt')

  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      calls.push(url)
      if (url.includes('/api/auth/token')) {
        return Promise.resolve(
          jsonResponse({ access_token: 'at', refresh_token: 'rt2', expires_in: 3600 }),
        )
      }
      if (url.includes('/api/me/session')) return Promise.resolve(jsonResponse(openedSession()))
      if (url.includes('/api/me/preferences')) {
        return preferences instanceof Promise
          ? preferences
          : Promise.resolve(jsonResponse(preferences, preferencesStatus))
      }
      if (url.includes('/api/events')) return Promise.resolve(jsonResponse(events))
      return Promise.resolve(jsonResponse({}, 404))
    }),
  )
}

function askedForPreferences(): boolean {
  return calls.some((url) => url.includes('/api/me/preferences'))
}

const PARIS = buildNamedRef('community', 1)
const LYON = buildNamedRef('community', 2)

const EVENTS = [
  buildEvent({ id: 'e1', title: 'Journée Paris', communities: [PARIS], technologies: [] }),
  buildEvent({ id: 'e2', title: 'Journée Lyon', communities: [LYON], technologies: [] }),
]

beforeEach(() => {
  calls = []
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('application des préférences à l’arrivée', () => {
  it('ouvre la liste déjà filtrée sur la sélection enregistrée', async () => {
    stubApi({
      events: EVENTS,
      preferences: { saved: true, communities: [PARIS], technologies: [] },
    })

    renderAt('/evenements')

    await waitFor(() => {
      expect(screen.getByText('1 évènement disponible')).not.toBeNull()
    })
    expect(screen.queryByText('Journée Lyon')).toBeNull()
  })

  it('ne montre jamais la liste complète avant de la réduire', async () => {
    // Le cœur de #192. Les évènements arrivent en premier — le cas qui produisait le
    // clignotement — et rien ne doit être peint tant que la sélection n'est pas connue.
    let resolvePreferences: (response: Response) => void = () => {}
    const pending = new Promise<Response>((resolve) => {
      resolvePreferences = resolve
    })

    stubApi({ events: EVENTS, preferences: pending })

    renderAt('/evenements')

    // Les évènements ont eu tout le loisir de retomber ; les préférences, non. On laisse
    // explicitement la réponse des évènements traverser ses `then` avant d'assertionner, sans
    // quoi le test passerait pour la mauvaise raison — parce que rien n'est encore arrivé.
    await waitFor(() => {
      expect(askedForPreferences()).toBe(true)
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(screen.getAllByTestId('event-card-skeleton').length).toBeGreaterThan(0)
    expect(screen.queryByText('Journée Lyon')).toBeNull()
    expect(screen.queryByText('2 évènements disponibles')).toBeNull()

    resolvePreferences(jsonResponse({ saved: true, communities: [PARIS], technologies: [] }))

    await waitFor(() => {
      expect(screen.getByText('1 évènement disponible')).not.toBeNull()
    })
    // Le compteur n'a jamais annoncé un nombre qu'il allait corriger.
    expect(screen.queryByText('2 évènements disponibles')).toBeNull()
  })

  it('ouvre sans filtre une sélection enregistrée vide, qui vaut « tous les évènements »', async () => {
    stubApi({ events: EVENTS, preferences: { saved: true, communities: [], technologies: [] } })

    renderAt('/evenements')

    await waitFor(() => {
      expect(screen.getByText('2 évènements disponibles')).not.toBeNull()
    })
  })

  it('ouvre sans filtre un compte sans préférence enregistrée', async () => {
    stubApi({ events: EVENTS, preferences: { saved: false, communities: [], technologies: [] } })

    renderAt('/evenements')

    await waitFor(() => {
      expect(screen.getByText('2 évènements disponibles')).not.toBeNull()
    })
  })

  it('ne demande rien hors session et rend la page d’aujourd’hui', async () => {
    stubApi({ signedIn: false, events: EVENTS })

    renderAt('/evenements')

    await waitFor(() => {
      expect(screen.getByText('2 évènements disponibles')).not.toBeNull()
    })
    expect(askedForPreferences()).toBe(false)
  })

  it('laisse la page consultable quand les préférences ne se chargent pas', async () => {
    stubApi({
      events: EVENTS,
      preferences: { code: 'PREFERENCES_READ_ERROR' },
      preferencesStatus: 500,
    })

    renderAt('/evenements')

    await waitFor(() => {
      expect(screen.getByText('2 évènements disponibles')).not.toBeNull()
    })
    // Le seul message affiché dit ce qui s'est passé, sans rien affirmer sur l'état des
    // préférences — ni qu'il n'y en a pas, ni qu'elles sont appliquées.
    expect(screen.getByText('Vos préférences n’ont pas pu être chargées.')).not.toBeNull()
  })

  it('applique une entrée enregistrée que le filtrage ne propose plus', async () => {
    // Une communauté archivée reste rattachée aux évènements qu'elle a portés (#155) : la
    // préférence continue donc de désigner quelque chose, alors même qu'aucune case ne la
    // représente dans le panneau.
    const archived = { ...LYON, archived: true }
    stubApi({
      events: [
        buildEvent({ id: 'e1', title: 'Journée Paris', communities: [PARIS], technologies: [] }),
        buildEvent({ id: 'e2', title: 'Journée Lyon', communities: [archived], technologies: [] }),
      ],
      preferences: { saved: true, communities: [archived], technologies: [] },
    })

    renderAt('/evenements')

    await waitFor(() => {
      expect(screen.getByText('1 évènement disponible')).not.toBeNull()
    })
    expect(screen.getByText('Journée Lyon')).not.toBeNull()
    // Proposée nulle part : elle est appliquée, pas offerte.
    expect(screen.queryByRole('checkbox', { name: /community 2/i })).toBeNull()
  })
})

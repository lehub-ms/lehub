import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderAt } from './support/render-route'
import { buildEvent, buildNamedRef } from './support/event-fixtures'
import { openedSession } from './support/session-fixtures'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const PARIS = buildNamedRef('community', 1)
const LYON = buildNamedRef('community', 2)
const DOTNET = buildNamedRef('technology', 1)

const EVENTS = [
  buildEvent({ id: 'e1', title: 'Journée Paris', communities: [PARIS], technologies: [DOTNET] }),
  buildEvent({ id: 'e2', title: 'Journée Lyon', communities: [LYON], technologies: [] }),
]

interface StubOptions {
  signedIn?: boolean
  /** L'état enregistré au chargement. */
  preferences?: { saved: boolean; communities: unknown[]; technologies: unknown[] }
  /** Ce que répond le PUT. Par défaut, il reflète ce qui a été soumis. */
  saveStatus?: number
  saveBody?: unknown
}

/** Les corps soumis au PUT, pour vérifier ce qui part réellement sur le réseau. */
let savedBodies: unknown[] = []

function stubApi({
  signedIn = true,
  preferences = { saved: false, communities: [], technologies: [] },
  saveStatus = 200,
  saveBody,
}: StubOptions = {}) {
  if (signedIn) window.localStorage.setItem('lehub.auth.refreshToken', 'rt')

  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/auth/token')) {
        return Promise.resolve(
          jsonResponse({ access_token: 'at', refresh_token: 'rt2', expires_in: 3600 }),
        )
      }
      if (url.includes('/api/me/session')) return Promise.resolve(jsonResponse(openedSession()))
      if (url.includes('/api/me/preferences')) {
        if (init?.method !== 'PUT') return Promise.resolve(jsonResponse(preferences))

        const submitted = JSON.parse(init.body as string) as {
          communityIds: string[]
          technologyIds: string[]
        }
        savedBodies.push(submitted)
        if (saveStatus !== 200) {
          return Promise.resolve(jsonResponse(saveBody ?? { code: 'BOOM' }, saveStatus))
        }
        // Le PUT rend l'état enregistré, comme la vraie route.
        const refs = [PARIS, LYON, DOTNET]
        return Promise.resolve(
          jsonResponse({
            saved: true,
            communities: refs.filter((ref) => submitted.communityIds.includes(ref.id)),
            technologies: refs.filter((ref) => submitted.technologyIds.includes(ref.id)),
          }),
        )
      }
      if (url.includes('/api/events')) return Promise.resolve(jsonResponse(EVENTS))
      return Promise.resolve(jsonResponse({}, 404))
    }),
  )
}

function bar(): HTMLElement {
  return screen.getByRole('region', { name: 'Mes préférences' })
}

const user = userEvent.setup({ pointerEventsCheck: 0 })

/** Coche une option du panneau de filtres de bureau. */
async function toggle(name: RegExp) {
  await user.click(screen.getByRole('checkbox', { name }))
}

beforeEach(() => {
  savedBodies = []
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('barre de préférences — les trois états', () => {
  it('propose d’enregistrer quand rien n’est enregistré, même sans filtre actif', async () => {
    // Enregistrer « tous les évènements » est un choix, pas une erreur.
    stubApi()
    renderAt('/evenements')

    await waitFor(() => {
      expect(within(bar()).getByText('Enregistrer ces filtres')).not.toBeNull()
    })
    expect(within(bar()).getByText(/Tous les évènements — aucun filtre/)).not.toBeNull()
    expect(
      within(bar()).getByRole('button', { name: 'Enregistrer mes préférences' }),
    ).not.toBeNull()
  })

  it('confirme quand la sélection correspond à l’enregistré', async () => {
    stubApi({ preferences: { saved: true, communities: [PARIS], technologies: [] } })
    renderAt('/evenements')

    await waitFor(() => {
      expect(within(bar()).getByText('Mes préférences')).not.toBeNull()
    })
    expect(within(bar()).getByText('appliquées')).not.toBeNull()
    expect(within(bar()).getByText('1 communauté')).not.toBeNull()
    // Rien à faire dans cet état — et surtout aucune promesse de lien d'agenda.
    expect(within(bar()).queryAllByRole('button')).toHaveLength(0)
    expect(bar().textContent).not.toMatch(/agenda/i)
  })

  it('énumère l’écart entrée par entrée dès que la sélection diverge', async () => {
    stubApi({ preferences: { saved: true, communities: [PARIS], technologies: [] } })
    renderAt('/evenements')

    await waitFor(() => {
      expect(within(bar()).getByText('Mes préférences')).not.toBeNull()
    })

    await toggle(/community 2/i)

    expect(within(bar()).getByText('Filtres modifiés')).not.toBeNull()
    expect(within(bar()).getByText('non enregistré')).not.toBeNull()
    // Nommée, pas comptée : « 1 modification » ne dirait pas laquelle.
    const entries = within(bar())
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(entries).toEqual([`Ajouté : + ${LYON.name}`])
  })
})

describe('barre de préférences — distinguer l’ajout du retrait', () => {
  it('marque chaque entrée autrement que par la couleur', async () => {
    stubApi({ preferences: { saved: true, communities: [PARIS], technologies: [] } })
    renderAt('/evenements')

    await waitFor(() => {
      expect(within(bar()).getByText('Mes préférences')).not.toBeNull()
    })

    await toggle(/community 1/i) // retiré
    await toggle(/community 2/i) // ajouté

    const items = within(bar()).getAllByRole('listitem')
    const labels = items.map((item) => item.textContent)

    expect(labels.some((label) => label?.startsWith('Ajouté : + '))).toBe(true)
    expect(labels.some((label) => label?.startsWith('Retiré : '))).toBe(true)
    // Le retrait porte aussi la rature, pour qui ne lit pas le lecteur d'écran.
    const removed = items.find((item) => item.textContent?.startsWith('Retiré'))
    expect(removed?.className).toContain('line-through')
  })
})

describe('barre de préférences — revenir et enregistrer', () => {
  it('restaure exactement la sélection enregistrée', async () => {
    stubApi({ preferences: { saved: true, communities: [PARIS], technologies: [DOTNET] } })
    renderAt('/evenements')

    await waitFor(() => {
      expect(within(bar()).getByText('Mes préférences')).not.toBeNull()
    })

    await toggle(/community 2/i)
    await toggle(/community 1/i)
    expect(within(bar()).getByText('Filtres modifiés')).not.toBeNull()

    await user.click(within(bar()).getByRole('button', { name: 'Revenir' }))

    await waitFor(() => {
      expect(within(bar()).getByText('Mes préférences')).not.toBeNull()
    })
    expect(screen.getByRole('checkbox', { name: /community 1/i }).getAttribute('data-state')).toBe('checked')
    expect(screen.getByRole('checkbox', { name: /community 2/i }).getAttribute('data-state')).toBe('unchecked')
  })

  it('revient au repos de lui-même quand la sélection est reproduite à la main', async () => {
    stubApi({ preferences: { saved: true, communities: [PARIS], technologies: [] } })
    renderAt('/evenements')

    await waitFor(() => {
      expect(within(bar()).getByText('Mes préférences')).not.toBeNull()
    })

    await toggle(/community 2/i)
    expect(within(bar()).getByText('Filtres modifiés')).not.toBeNull()

    await toggle(/community 2/i)

    // Aucune action supplémentaire : la comparaison est ensembliste, pas un journal de gestes.
    expect(within(bar()).getByText('Mes préférences')).not.toBeNull()
  })

  it('confirme le premier enregistrement sans rien promettre d’un agenda', async () => {
    stubApi()
    renderAt('/evenements')

    await waitFor(() => {
      expect(within(bar()).getByText('Enregistrer ces filtres')).not.toBeNull()
    })

    await toggle(/community 1/i)
    await user.click(within(bar()).getByRole('button', { name: 'Enregistrer mes préférences' }))

    await waitFor(() => {
      expect(screen.getByText('Préférences enregistrées')).not.toBeNull()
    })
    expect(screen.queryByText(/lien d’agenda|lien d'agenda/)).toBeNull()
    expect(savedBodies).toEqual([{ communityIds: [PARIS.id], technologyIds: [] }])
    // Enregistré : la barre passe au repos.
    await waitFor(() => {
      expect(within(bar()).getByText('Mes préférences')).not.toBeNull()
    })
  })

  it('dit qu’aucun réabonnement n’est nécessaire à la mise à jour', async () => {
    stubApi({ preferences: { saved: true, communities: [PARIS], technologies: [] } })
    renderAt('/evenements')

    await waitFor(() => {
      expect(within(bar()).getByText('Mes préférences')).not.toBeNull()
    })

    await toggle(/community 2/i)
    await user.click(within(bar()).getByRole('button', { name: 'Mettre à jour mes préférences' }))

    await waitFor(() => {
      expect(screen.getByText('Préférences mises à jour')).not.toBeNull()
    })
    expect(screen.getByText(/Aucun réabonnement nécessaire/)).not.toBeNull()
  })

  it('enregistre une sélection vidée, qui vaut « tous les évènements »', async () => {
    // Tout décocher alors que des préférences existent est une divergence légitime et
    // enregistrable — pas une demande de suppression.
    stubApi({ preferences: { saved: true, communities: [PARIS], technologies: [] } })
    renderAt('/evenements')

    await waitFor(() => {
      expect(within(bar()).getByText('Mes préférences')).not.toBeNull()
    })

    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    expect(within(bar()).getByText('Filtres modifiés')).not.toBeNull()

    await user.click(within(bar()).getByRole('button', { name: 'Mettre à jour mes préférences' }))

    await waitFor(() => {
      expect(savedBodies).toEqual([{ communityIds: [], technologyIds: [] }])
    })
    // Réinitialiser n'a jamais déclenché de suppression.
    expect(savedBodies).toHaveLength(1)
  })
})

describe('barre de préférences — échecs', () => {
  it('garde la sélection et la divergence quand l’enregistrement échoue', async () => {
    stubApi({
      preferences: { saved: true, communities: [PARIS], technologies: [] },
      saveStatus: 500,
    })
    renderAt('/evenements')

    await waitFor(() => {
      expect(within(bar()).getByText('Mes préférences')).not.toBeNull()
    })

    await toggle(/community 2/i)
    await user.click(within(bar()).getByRole('button', { name: 'Mettre à jour mes préférences' }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('n’ont pas pu être enregistrées')
    })
    expect(within(bar()).getByText('Filtres modifiés')).not.toBeNull()
    expect(screen.getByRole('checkbox', { name: /community 2/i }).getAttribute('data-state')).toBe('checked')
  })

  it('traite une session expirée comme une reconnexion, pas comme un échec d’écriture', async () => {
    // Un 401 n'est pas réparable en réessayant : la barre ne doit donc pas rendre le message
    // « réessayez dans un instant », qui enverrait l'utilisateur boucler sur un bouton mort.
    // Elle renvoie à la connexion — que la page de connexion accepte ou renvoie aussitôt vers
    // l'agenda est sa décision à elle, pas celle de la barre, et n'est pas assertionné ici.
    stubApi({
      preferences: { saved: true, communities: [PARIS], technologies: [] },
      saveStatus: 401,
      saveBody: { code: 'TOKEN_EXPIRED' },
    })
    renderAt('/evenements')

    await waitFor(() => {
      expect(within(bar()).getByText('Mes préférences')).not.toBeNull()
    })

    await toggle(/community 2/i)
    await user.click(within(bar()).getByRole('button', { name: 'Mettre à jour mes préférences' }))

    await waitFor(() => {
      expect(savedBodies).toHaveLength(1)
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('barre de préférences — hors session', () => {
  it('n’est jamais rendue à un visiteur', async () => {
    stubApi({ signedIn: false })
    renderAt('/evenements')

    await waitFor(() => {
      expect(screen.getByText('2 évènements disponibles')).not.toBeNull()
    })
    // Ni vide, ni désactivée, ni transformée en accroche.
    expect(screen.queryByRole('region', { name: 'Mes préférences' })).toBeNull()
  })
})

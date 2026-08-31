import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PATHS } from '@/lib/navigation'
import { renderAt } from './support/render-route'
import { ADMIN_COMMUNITIES, GLOBAL_ADMIN } from './support/session-fixtures'
import { jsonResponse, stubSignedIn, type FetchOverrides } from './support/stub-session'

const FIRST = ADMIN_COMMUNITIES[0]!

async function enter(path: string, overrides: FetchOverrides = {}): Promise<void> {
  stubSignedIn(GLOBAL_ADMIN, overrides)
  renderAt(path)
  await screen.findByRole('table')
}

function panel(): HTMLElement {
  return screen.getByRole('dialog')
}

/** Les corps réellement envoyés, dans l'ordre, pour la route donnée. */
function bodiesFor(method: string, fragment: string): Record<string, unknown>[] {
  const fetchMock = globalThis.fetch as unknown as {
    mock: { calls: [string, RequestInit | undefined][] }
  }
  return fetchMock.mock.calls
    .filter(([url, init]) => url.includes(fragment) && init?.method === method)
    .map(([, init]) => {
      const body = init?.body
      // Seuls les corps JSON passent ici ; un `FormData` (le téléversement) n'a rien à y faire.
      return typeof body === 'string'
        ? (JSON.parse(body) as Record<string, unknown>)
        : {}
    })
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('panneau de création', () => {
  it('s’ouvre depuis le bouton d’ajout et dit qu’il crée', async () => {
    await enter(PATHS.communities)

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle communauté' }))

    expect(within(panel()).getByRole('heading', { name: 'Nouvelle communauté' })).not.toBeNull()
  })

  it('crée une entrée active par défaut, et n’envoie que ce qui a été saisi', async () => {
    await enter(PATHS.communities, {
      '/api/manage/communities': (attempt) =>
        attempt === 1 ? jsonResponse(ADMIN_COMMUNITIES) : jsonResponse(ADMIN_COMMUNITIES[1]!, 201),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle communauté' }))
    fireEvent.change(within(panel()).getByLabelText(/Nom/), {
      target: { value: '  Cloud Native Nantes  ' },
    })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => {
      expect(bodiesFor('POST', '/api/manage/communities')).toHaveLength(1)
    })
    expect(bodiesFor('POST', '/api/manage/communities')[0]).toEqual({
      // Rogné avant l'envoi : trois espaces ne sont pas un nom.
      name: 'Cloud Native Nantes',
      // Proposé depuis le nom, et bel et bien transmis — voir communitySlug.test.tsx.
      slug: 'cloud-native-nantes',
      description: null,
      logoPath: null,
      status: 'active',
    })
  })

  it('referme le panneau et remet la table à jour, sans recharger l’écran', async () => {
    let listed = 0
    await enter(PATHS.communities, {
      '/api/manage/communities': () => {
        listed += 1
        return jsonResponse(ADMIN_COMMUNITIES)
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle communauté' }))
    fireEvent.change(within(panel()).getByLabelText(/Nom/), { target: { value: 'Nouvelle' } })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    // La liste est relue : les compteurs viennent du serveur, pas d'une ligne recomposée ici.
    await waitFor(() => {
      expect(listed).toBeGreaterThan(2)
    })
  })

  it('refuse un enregistrement sans nom, signale le champ et n’appelle pas l’API', async () => {
    await enter(PATHS.communities)

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle communauté' }))
    fireEvent.click(within(panel()).getByRole('button', { name: 'Enregistrer' }))

    const name = within(panel()).getByLabelText(/Nom/)
    expect(name.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(name)
    expect(bodiesFor('POST', '/api/manage/communities')).toHaveLength(0)
  })

  it('annonce le doublon de nom sur le champ, avec un message explicite', async () => {
    await enter(PATHS.communities, {
      '/api/manage/communities': (attempt) =>
        attempt === 1
          ? jsonResponse(ADMIN_COMMUNITIES)
          : jsonResponse({ code: 'COMMUNITY_NAME_TAKEN', message: 'taken' }, 409),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle communauté' }))
    fireEvent.change(within(panel()).getByLabelText(/Nom/), { target: { value: FIRST.name } })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Enregistrer' }))

    expect(
      await within(panel()).findByText('Une autre communauté porte déjà ce nom.'),
    ).not.toBeNull()
    // Le panneau reste ouvert : la saisie n'est pas perdue.
    expect(screen.getByRole('dialog')).not.toBeNull()
  })

  it('refuse une description plus longue que la limite, en l’annonçant', async () => {
    await enter(PATHS.communities)

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle communauté' }))
    fireEvent.change(within(panel()).getByLabelText(/Nom/), { target: { value: 'A' } })
    fireEvent.change(within(panel()).getByLabelText(/Description/), {
      target: { value: 'd'.repeat(301) },
    })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Enregistrer' }))

    expect(within(panel()).getByText(/dépasse 300 caractères/)).not.toBeNull()
    // Jamais tronquée en silence : rien n'est parti.
    expect(bodiesFor('POST', '/api/manage/communities')).toHaveLength(0)
  })
})

describe('panneau de modification', () => {
  it('s’ouvre depuis la ligne, dit qu’il modifie, et porte les valeurs existantes', async () => {
    await enter(PATHS.communities)

    fireEvent.click(screen.getByRole('button', { name: `Modifier ${FIRST.name}` }))

    expect(within(panel()).getByRole('heading', { name: 'Modifier la communauté' })).not.toBeNull()
    expect(within(panel()).getByLabelText(/Nom/)).toHaveProperty('value', FIRST.name)
  })

  it('n’envoie la modification que sur la route de l’entrée', async () => {
    await enter(PATHS.communities)

    fireEvent.click(screen.getByRole('button', { name: `Modifier ${FIRST.name}` }))
    fireEvent.change(within(panel()).getByLabelText(/Nom/), { target: { value: 'Renommée' } })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => {
      expect(bodiesFor('PATCH', `/api/manage/communities/${FIRST.id}`)).toHaveLength(1)
    })
    expect(bodiesFor('PATCH', `/api/manage/communities/${FIRST.id}`)[0]).toMatchObject({
      name: 'Renommée',
    })
  })

  it('change le statut dans les deux sens depuis le panneau', async () => {
    await enter(PATHS.communities)

    fireEvent.click(screen.getByRole('button', { name: `Modifier ${FIRST.name}` }))
    const group = within(panel()).getByRole('radiogroup', { name: 'Statut' })

    expect(within(group).getByRole('radio', { name: 'Active' }).getAttribute('aria-checked')).toBe(
      'true',
    )
    fireEvent.click(within(group).getByRole('radio', { name: 'Archivée' }))
    expect(
      within(group).getByRole('radio', { name: 'Archivée' }).getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('ne conserve rien quand le panneau est refermé sans enregistrer', async () => {
    await enter(PATHS.communities)

    fireEvent.click(screen.getByRole('button', { name: `Modifier ${FIRST.name}` }))
    fireEvent.change(within(panel()).getByLabelText(/Nom/), { target: { value: 'Jeté' } })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Annuler' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: `Modifier ${FIRST.name}` }))
    expect(within(panel()).getByLabelText(/Nom/)).toHaveProperty('value', FIRST.name)
  })

  it('se referme par la touche d’échappement', async () => {
    await enter(PATHS.communities)

    fireEvent.click(screen.getByRole('button', { name: `Modifier ${FIRST.name}` }))
    fireEvent.keyDown(panel(), { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('prend le focus à l’ouverture et le rend au déclencheur à la fermeture', async () => {
    await enter(PATHS.communities)
    const trigger = screen.getByRole('button', { name: `Modifier ${FIRST.name}` })

    // Focalisé avant le clic : un vrai clic focalise le bouton, `fireEvent.click` non, et c'est
    // à l'élément focalisé que Radix rend la main en se refermant.
    trigger.focus()
    fireEvent.click(trigger)

    // Le contrat du piège à focus, vérifié par ce qu'il produit plutôt que par un attribut :
    // jsdom n'arbitre pas la tabulation, mais il observe très bien où le focus se trouve.
    await waitFor(() => {
      expect(panel().contains(document.activeElement)).toBe(true)
    })

    fireEvent.keyDown(panel(), { key: 'Escape' })

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })
  })
})

describe('panneau des technologies', () => {
  it('ne propose pas de description', async () => {
    await enter(PATHS.technologies)

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle technologie' }))

    expect(within(panel()).queryByLabelText(/Description/)).toBeNull()
    expect(within(panel()).getByLabelText(/Nom/)).not.toBeNull()
  })

  it('envoie un corps sans description', async () => {
    await enter(PATHS.technologies)

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle technologie' }))
    fireEvent.change(within(panel()).getByLabelText(/Nom/), { target: { value: 'Bicep' } })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => {
      expect(bodiesFor('POST', '/api/manage/technologies')).toHaveLength(1)
    })
    expect(bodiesFor('POST', '/api/manage/technologies')[0]).toEqual({
      name: 'Bicep',
      logoPath: null,
      status: 'active',
    })
  })
})

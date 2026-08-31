import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { communityPath, eventPath } from '@/lib/navigation'
import { renderAt } from './support/render-route'
import { ADMIN_EVENTS, COMMUNITIES, EVENT_OPTIONS, ORGANIZER } from './support/session-fixtures'
import { jsonResponse, stubSignedIn } from './support/stub-session'

const AZUG = COMMUNITIES[0]!
const LIST_PATH = communityPath(AZUG.slug, 'evenements')

/** Le premier évènement de la fixture : 10 septembre 2026, 16:30 UTC, avec bannière. */
const EVENT = ADMIN_EVENTS[0]!
const EDIT_PATH = eventPath(AZUG.slug, EVENT.id)

let confirmSpy: MockInstance<(message?: string) => boolean>

/** Les écritures vers la route d'un évènement, méthode par méthode. */
function writes(method: string): RequestInit[] {
  const fetchMock = globalThis.fetch as unknown as {
    mock: { calls: [string, RequestInit | undefined][] }
  }
  return fetchMock.mock.calls
    .filter(([url, init]) => url.includes('/api/manage/events/') && init?.method === method)
    .map(([, init]) => init as RequestInit)
}

function lastPatch(): Record<string, unknown> {
  return JSON.parse(writes('PATCH').at(-1)?.body as string) as Record<string, unknown>
}

function field(label: string): HTMLElement {
  return screen.getByLabelText(label)
}

async function openEdit(path = EDIT_PATH) {
  const rendered = renderAt(path)
  await screen.findByLabelText('Titre *')
  return rendered
}

beforeEach(() => {
  window.localStorage.clear()
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('modification d’un évènement', () => {
  it('porte l’identifiant dans la route : recharger rouvre le même évènement', async () => {
    stubSignedIn(ORGANIZER)
    const { router } = await openEdit()

    expect(router.state.location.pathname).toBe(EDIT_PATH)
    expect((field('Titre *') as HTMLInputElement).value).toBe(EVENT.title)
  })

  it('préremplit tous les champs, dates converties en heure de Paris', async () => {
    stubSignedIn(ORGANIZER)
    await openEdit()

    expect((field('Titre *') as HTMLInputElement).value).toBe(EVENT.title)
    expect((field('Description') as HTMLTextAreaElement).value).toBe(EVENT.description)
    // 16:30 UTC un 10 septembre, c'est 18:30 à Paris.
    expect((field('Début *') as HTMLInputElement).value).toBe('2026-09-10T18:30')
    expect((field('Fin *') as HTMLInputElement).value).toBe('2026-09-10T21:00')
    expect((field('Type *') as HTMLSelectElement).value).toBe(EVENT.formatTypeId)

    const mode = EVENT_OPTIONS.modes.find((option) => option.id === EVENT.eventModeId)!
    expect(screen.getByRole('radio', { name: mode.name }).getAttribute('aria-checked')).toBe('true')
  })

  it('porte le titre de l’évènement dans le fil d’ariane et dans le titre de page', async () => {
    stubSignedIn(ORGANIZER)
    await openEdit()

    expect(screen.getByRole('heading', { level: 1, name: EVENT.title })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Fil d’ariane' }).textContent).toContain(EVENT.title)
  })

  it('applique les mêmes règles de validation qu’à la création', async () => {
    stubSignedIn(ORGANIZER)
    await openEdit()

    fireEvent.change(field('Titre *'), { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(screen.getByText('Le titre est obligatoire.')).toBeTruthy()
    expect(writes('PATCH')).toHaveLength(0)
  })

  it('refuse une date de fin ramenée avant le début', async () => {
    stubSignedIn(ORGANIZER)
    await openEdit()

    fireEvent.change(field('Fin *'), { target: { value: '2026-09-10T17:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(screen.getByText('La date de fin doit être postérieure à la date de début.')).toBeTruthy()
  })

  it('n’envoie que ce que le formulaire possède, et ramène à la liste', async () => {
    stubSignedIn(ORGANIZER)
    const { router } = await openEdit()

    fireEvent.change(field('Titre *'), { target: { value: 'Azure Deep Dive — édition 2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(LIST_PATH)
    })

    const sent = lastPatch()
    expect(sent.title).toBe('Azure Deep Dive — édition 2')
    expect(sent.startDate).toBe(EVENT.startDate)
    // Rattachements et bannière repartent **inchangés** plutôt qu'absents : le formulaire les
    // possède depuis #147 et #148, et il renvoie l'état qu'il affiche.
    expect(sent.communityIds).toEqual(EVENT.communities.map((community) => community.id))
    expect(sent.technologyIds).toEqual([])
    expect(sent.bannerImagePath).toBe(EVENT.bannerImagePath)
    // L'URL, en revanche, ne repart jamais : l'entité ne retient qu'un chemin relatif au
    // conteneur média (migration 0003).
    expect(sent).not.toHaveProperty('bannerImageUrl')
  })

  it('dit qu’un identifiant inconnu ne correspond à rien, et ramène à la liste', async () => {
    stubSignedIn(ORGANIZER)
    renderAt(eventPath(AZUG.slug, 'E9E9E9E9-0000-0000-0000-000000000009'))

    expect(await screen.findByText('Cet évènement n’existe plus')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Retour à la liste' }).getAttribute('href')).toBe(LIST_PATH)
    // Ni page blanche ni erreur brute : le formulaire n'est pas monté du tout.
    expect(screen.queryByLabelText('Titre *')).toBeNull()
  })

  it('dit explicitement qu’un évènement supprimé ailleurs ne peut plus être enregistré', async () => {
    // L'edge case de #146 : supprimé depuis un autre onglet pendant l'édition. L'écriture
    // échoue au lieu de recréer l'évènement.
    let reads = 0
    stubSignedIn(ORGANIZER, {
      '/api/manage/events/': (attempt) => {
        reads = attempt
        return attempt === 1
          ? jsonResponse(EVENT)
          : jsonResponse({ code: 'EVENT_NOT_FOUND' }, 404)
      },
    })
    await openEdit()

    fireEvent.change(field('Titre *'), { target: { value: 'Trop tard' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('supprimé pendant que vous le modifiiez')
    expect(reads).toBeGreaterThan(1)
    // La saisie reste à l'écran.
    expect((field('Titre *') as HTMLInputElement).value).toBe('Trop tard')
  })

  it('restitue un refus d’habilitation sans ouvrir le formulaire', async () => {
    // « Un évènement que l'appelant n'est pas habilité à modifier n'est pas ouvert en
    // modification, et l'API refuse de toute façon » (#146). Le 403 vient de la lecture.
    stubSignedIn(ORGANIZER, {
      '/api/manage/events/': () => jsonResponse({ code: 'FORBIDDEN' }, 403),
    })
    renderAt(EDIT_PATH)

    expect(await screen.findByText('Impossible de charger le formulaire')).toBeTruthy()
    expect(screen.queryByLabelText('Titre *')).toBeNull()
  })

  it('demande confirmation avant d’abandonner une modification', async () => {
    stubSignedIn(ORGANIZER)
    const { router } = await openEdit()

    fireEvent.change(field('Titre *'), { target: { value: 'Modifié' } })
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(LIST_PATH)
    })
  })

  it('ne demande rien quand on ouvre puis quitte sans rien changer', async () => {
    // Le préremplissage n'est pas une modification : il ne doit pas armer la garde.
    stubSignedIn(ORGANIZER)
    const { router } = await openEdit()

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(LIST_PATH)
    })
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})

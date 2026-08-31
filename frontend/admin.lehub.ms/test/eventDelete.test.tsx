import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { communityPath, eventPath } from '@/lib/navigation'
import { renderAt } from './support/render-route'
import { ADMIN_EVENTS, COMMUNITIES, ORGANIZER } from './support/session-fixtures'
import { jsonResponse, noContent, stubSignedIn } from './support/stub-session'

const AZUG = COMMUNITIES[0]!
const LIST_PATH = communityPath(AZUG.slug, 'evenements')
const EVENT = ADMIN_EVENTS[0]!

function deletions(): number {
  const fetchMock = globalThis.fetch as unknown as {
    mock: { calls: [string, RequestInit | undefined][] }
  }
  return fetchMock.mock.calls.filter(
    ([url, init]) => url.includes('/api/manage/events/') && init?.method === 'DELETE',
  ).length
}

function dialog(): HTMLElement {
  return screen.getByRole('alertdialog')
}

/** Capturée plutôt que relue sur `window` : une méthode détachée de son objet déclenche
    `@typescript-eslint/unbound-method`. */
let confirmSpy: MockInstance<(message?: string) => boolean>

beforeEach(() => {
  window.localStorage.clear()
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('suppression depuis la liste', () => {
  it('demande une confirmation qui nomme l’évènement et dit ce qu’elle fait', async () => {
    stubSignedIn(ORGANIZER)
    renderAt(LIST_PATH)
    await screen.findByRole('table')

    fireEvent.click(screen.getByRole('button', { name: `Supprimer ${EVENT.title}` }))

    // Le nom, le retrait de lehub.ms, le caractère définitif : les trois que #149 exige.
    expect(within(dialog()).getByText(EVENT.title)).toBeTruthy()
    expect(dialog().textContent).toContain('sera retiré de lehub.ms')
    expect(dialog().textContent).toContain('définitive')
    // Rien n'est parti tant que rien n'est confirmé.
    expect(deletions()).toBe(0)
  })

  it('focalise l’action sûre plutôt que l’action destructrice', async () => {
    stubSignedIn(ORGANIZER)
    renderAt(LIST_PATH)
    await screen.findByRole('table')

    fireEvent.click(screen.getByRole('button', { name: `Supprimer ${EVENT.title}` }))

    // `AlertDialog` de Radix focalise l'annulation : « l'action par défaut n'est pas
    // destructrice » est tenu par le composant, pas par une précaution locale.
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Annuler')
    })
  })

  it('se referme par la touche d’échappement sans rien supprimer', async () => {
    stubSignedIn(ORGANIZER)
    renderAt(LIST_PATH)
    await screen.findByRole('table')

    fireEvent.click(screen.getByRole('button', { name: `Supprimer ${EVENT.title}` }))
    fireEvent.keyDown(dialog(), { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull()
    })
    expect(deletions()).toBe(0)
  })

  it('supprime et relit la liste sans changer d’écran', async () => {
    let listed = 0
    stubSignedIn(ORGANIZER, {
      '/api/manage/events?': (attempt) => {
        listed = attempt
        // Après la suppression, la communauté n'a plus qu'un évènement.
        return jsonResponse(attempt === 1 ? [EVENT, ADMIN_EVENTS[1]] : [ADMIN_EVENTS[1]])
      },
      '/api/manage/events/': () => noContent(),
    })
    const { router } = renderAt(LIST_PATH)
    await screen.findByRole('table')

    fireEvent.click(screen.getByRole('button', { name: `Supprimer ${EVENT.title}` }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Supprimer' }))

    await waitFor(() => {
      expect(deletions()).toBe(1)
    })
    // On reste sur la liste, et elle se relit.
    await waitFor(() => {
      expect(listed).toBeGreaterThan(1)
    })
    expect(router.state.location.pathname).toBe(LIST_PATH)
  })

  it('affiche l’état vide quand le dernier évènement disparaît', async () => {
    stubSignedIn(ORGANIZER, {
      '/api/manage/events?': (attempt) => jsonResponse(attempt === 1 ? [EVENT] : []),
      '/api/manage/events/': () => noContent(),
    })
    renderAt(LIST_PATH)
    await screen.findByRole('table')

    fireEvent.click(screen.getByRole('button', { name: `Supprimer ${EVENT.title}` }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Supprimer' }))

    expect(await screen.findByText('Aucun évènement pour cette communauté')).toBeTruthy()
  })

  it('dit explicitement qu’un évènement déjà supprimé l’était', async () => {
    // L'edge case de #149 : supprimé depuis un autre onglet. Un message, pas une erreur brute.
    stubSignedIn(ORGANIZER, {
      '/api/manage/events/': () => jsonResponse({ code: 'EVENT_NOT_FOUND' }, 404),
    })
    renderAt(LIST_PATH)
    await screen.findByRole('table')

    fireEvent.click(screen.getByRole('button', { name: `Supprimer ${EVENT.title}` }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Supprimer' }))

    expect((await screen.findByRole('alert')).textContent).toContain('déjà été supprimé')
  })

  it('restitue un refus d’habilitation', async () => {
    stubSignedIn(ORGANIZER, {
      '/api/manage/events/': () => jsonResponse({ code: 'FORBIDDEN' }, 403),
    })
    renderAt(LIST_PATH)
    await screen.findByRole('table')

    fireEvent.click(screen.getByRole('button', { name: `Supprimer ${EVENT.title}` }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Supprimer' }))

    expect((await screen.findByRole('alert')).textContent).toContain('pas autorisé à supprimer')
  })
})

describe('suppression depuis le formulaire', () => {
  it('n’offre pas la suppression en création', async () => {
    stubSignedIn(ORGANIZER)
    renderAt(`${LIST_PATH}/nouveau`)
    await screen.findByLabelText('Titre *')

    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull()
  })

  it('offre la suppression en modification, et ramène à la liste', async () => {
    stubSignedIn(ORGANIZER, {
      '/api/manage/events/': (attempt) => (attempt === 1 ? jsonResponse(EVENT) : noContent()),
    })
    const { router } = renderAt(eventPath(AZUG.slug, EVENT.id))
    await screen.findByLabelText('Titre *')

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Supprimer' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(LIST_PATH)
    })
  })

  it('ne demande pas de confirmer un abandon de saisie en plus de la suppression', async () => {
    // Supprimer n'est pas abandonner : la garde de sortie est désarmée avant la navigation.
    stubSignedIn(ORGANIZER, {
      '/api/manage/events/': (attempt) => (attempt === 1 ? jsonResponse(EVENT) : noContent()),
    })
    const { router } = renderAt(eventPath(AZUG.slug, EVENT.id))
    await screen.findByLabelText('Titre *')

    fireEvent.change(screen.getByLabelText('Titre *'), { target: { value: 'Modifié' } })
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Supprimer' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(LIST_PATH)
    })
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})

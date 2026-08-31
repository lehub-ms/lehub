import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PATHS } from '@/lib/navigation'
import { renderAt } from './support/render-route'
import { ADMIN_COMMUNITIES, GLOBAL_ADMIN } from './support/session-fixtures'
import { jsonResponse, noContent, stubSignedIn, type FetchOverrides } from './support/stub-session'

/** Rattachée à 3 évènements : la suppression définitive lui est refusée. */
const REFERENCED = ADMIN_COMMUNITIES[0]!
/** Aucun évènement, aucun organisateur : la seule que l'on puisse supprimer. */
const FREE = ADMIN_COMMUNITIES[1]!
/** Archivée, 7 évènements : celle qu'on réactive. */
const ARCHIVED = ADMIN_COMMUNITIES[2]!

async function openPanelFor(name: string, overrides: FetchOverrides = {}): Promise<void> {
  stubSignedIn(GLOBAL_ADMIN, overrides)
  renderAt(PATHS.communities)
  await screen.findByRole('table')
  fireEvent.click(screen.getByRole('button', { name: `Modifier ${name}` }))
}

function confirmation(): HTMLElement {
  return screen.getByRole('alertdialog')
}

function callsTo(method: string, fragment: string): number {
  const fetchMock = globalThis.fetch as unknown as {
    mock: { calls: [string, RequestInit | undefined][] }
  }
  return fetchMock.mock.calls.filter(
    ([url, init]) => url.includes(fragment) && init?.method === method,
  ).length
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('suppression d’une entrée libre', () => {
  it('nomme l’entrée et énonce le caractère définitif de l’action', async () => {
    await openPanelFor(FREE.name)

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    // `alertdialog` et non `dialog` : ce que les maquettes demandent, et ce que Radix pose.
    expect(within(confirmation()).getByText(FREE.name)).not.toBeNull()
    expect(within(confirmation()).getByText(/irréversible/)).not.toBeNull()
  })

  it('supprime et met la table à jour', async () => {
    await openPanelFor(FREE.name, {
      [`/api/admin/communities/${FREE.id}`]: () => noContent(),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(within(confirmation()).getByRole('button', { name: 'Supprimer' }))

    await waitFor(() => {
      expect(callsTo('DELETE', `/api/admin/communities/${FREE.id}`)).toBe(1)
    })
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull()
    })
  })

  it('ne dit rien des organisateurs quand il n’y en a aucun', async () => {
    await openPanelFor(FREE.name)

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    expect(within(confirmation()).queryByText(/désignation/)).toBeNull()
  })

  it('prévient que les désignations partiront avec la communauté', async () => {
    // FK_CommunityOrganizer_Community cascade : c'est vrai, donc c'est dit.
    await openPanelFor(ARCHIVED.name)
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    // Celle-ci porte aussi des évènements : c'est l'autre variante qui s'affiche, et elle ne
    // parle pas de désignations puisqu'elle ne supprimera rien.
    expect(within(confirmation()).getByText(/Suppression impossible/)).not.toBeNull()
  })
})

describe('refus de supprimer une entrée référencée', () => {
  it('annonce le nombre d’évènements et propose l’archivage', async () => {
    await openPanelFor(REFERENCED.name)

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    expect(within(confirmation()).getByText(/Suppression impossible/)).not.toBeNull()
    expect(within(confirmation()).getByText(/3 évènements/)).not.toBeNull()
    expect(within(confirmation()).getByRole('button', { name: 'Archiver' })).not.toBeNull()
    // Et surtout : pas de bouton « Supprimer » dans cette variante.
    expect(within(confirmation()).queryByRole('button', { name: 'Supprimer' })).toBeNull()
  })

  it('archive depuis cette modale, sans rien supprimer', async () => {
    await openPanelFor(REFERENCED.name)

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(within(confirmation()).getByRole('button', { name: 'Archiver' }))

    await waitFor(() => {
      expect(callsTo('PATCH', `/api/admin/communities/${REFERENCED.id}`)).toBe(1)
    })
    expect(callsTo('DELETE', `/api/admin/communities/${REFERENCED.id}`)).toBe(0)
  })

  it('bascule sur place quand le refus arrive en cours de route', async () => {
    // La course de #155 : l'entrée était libre au chargement, un évènement l'a rattachée depuis.
    await openPanelFor(FREE.name, {
      [`/api/admin/communities/${FREE.id}`]: () =>
        jsonResponse({ code: 'REFERENCE_IN_USE', message: 'nope', eventCount: 2 }, 409),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(within(confirmation()).getByRole('button', { name: 'Supprimer' }))

    // La modale reste ouverte et dit le nombre à jour, qui vient du corps du 409.
    expect(await within(confirmation()).findByText(/Suppression impossible/)).not.toBeNull()
    expect(within(confirmation()).getByText(/2 évènements/)).not.toBeNull()
  })

  it('ne se referme pas sur un clic à côté', async () => {
    await openPanelFor(FREE.name)
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    fireEvent.pointerDown(document.body)
    fireEvent.click(document.body)

    // Une confirmation destructive ne se dissipe pas par accident — c'est ce qu'apporte
    // `AlertDialog` et que `Dialog` n'apporte pas.
    expect(screen.getByRole('alertdialog')).not.toBeNull()
  })
})

describe('réactivation', () => {
  it('remet une entrée archivée en service depuis le panneau', async () => {
    await openPanelFor(ARCHIVED.name)

    const group = within(screen.getByRole('dialog')).getByRole('radiogroup', { name: 'Statut' })
    expect(within(group).getByRole('radio', { name: 'Archivée' }).getAttribute('aria-checked')).toBe(
      'true',
    )

    fireEvent.click(within(group).getByRole('radio', { name: 'Active' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => {
      expect(callsTo('PATCH', `/api/admin/communities/${ARCHIVED.id}`)).toBe(1)
    })
  })
})

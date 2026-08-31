import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminEvent } from '@/lib/api'
import { isPastEvent } from '@/lib/eventDates'
import { communityPath } from '@/lib/navigation'
import { renderAt } from './support/render-route'
import { ADMIN_EVENTS, COMMUNITIES, ORGANIZER } from './support/session-fixtures'
import { jsonResponse, stubSignedIn } from './support/stub-session'

const AZUG = COMMUNITIES[0]!
const LIST_PATH = communityPath(AZUG.slug, 'evenements')

/** Figée : les fixtures portent des dates de 2026, et c'est l'horloge qui décide du repli. */
const NOW = new Date('2026-08-31T12:00:00Z')

const UPCOMING = ADMIN_EVENTS[0]!
const FAR = ADMIN_EVENTS[1]!
const PAST = ADMIN_EVENTS[2]!

/** Commencé mais non terminé : il n'est pas passé, et c'est le cas le plus utile à l'écran. */
const IN_PROGRESS: AdminEvent = {
  ...UPCOMING,
  id: 'E5E5E5E5-0000-0000-0000-000000000005',
  title: 'Hackathon en cours',
  startDate: '2026-08-31T08:00:00.000Z',
  endDate: '2026-08-31T18:00:00.000Z',
}

function serve(events: AdminEvent[]) {
  stubSignedIn(ORGANIZER, { '/api/manage/events?': () => jsonResponse(events) })
}

function titles(): string[] {
  return within(screen.getByRole('table'))
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('cell').length > 1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '')
}

function groupRow(): HTMLElement {
  return screen.getByRole('button', { name: /passé/ })
}

function search(value: string): void {
  fireEvent.change(screen.getByRole('searchbox', { name: /Rechercher/ }), { target: { value } })
}

async function enter(): Promise<void> {
  renderAt(LIST_PATH)
  await screen.findByRole('table')
}

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('frontière passé / à venir', () => {
  it('décide sur la date de fin, jamais sur celle de début', () => {
    expect(isPastEvent(PAST.endDate, NOW.getTime())).toBe(true)
    expect(isPastEvent(UPCOMING.endDate, NOW.getTime())).toBe(false)
  })

  it('ne range pas un évènement en cours parmi les passés', async () => {
    // Commencé ce matin, terminé ce soir : c'est celui sur lequel un organisateur est le plus
    // susceptible d'agir, il reste donc visible.
    expect(isPastEvent(IN_PROGRESS.endDate, NOW.getTime())).toBe(false)

    serve([IN_PROGRESS, PAST])
    await enter()

    expect(titles().join(' ')).toContain('Hackathon en cours')
    expect(titles().join(' ')).not.toContain('Rétrospective')
  })

  it('ne replie pas une date illisible', () => {
    // Mieux vaut la laisser sous les yeux, où elle se corrige, que la cacher dans un groupe.
    expect(isPastEvent('pas une date', NOW.getTime())).toBe(false)
  })

  it('ne fait pas changer un évènement de groupe pendant que la page est ouverte', async () => {
    serve([IN_PROGRESS, PAST])
    await enter()
    expect(titles()).toHaveLength(1)

    // La page est ouverte, l'évènement se termine. Il ne bouge pas : la frontière a été figée
    // au montage, ce que l'edge case de #174 demande.
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'))
    search('hackathon')
    expect(titles().join(' ')).toContain('Hackathon en cours')
  })
})

describe('ligne de groupe des évènements passés', () => {
  it('replie le passé par défaut, derrière une ligne unique qui le compte', async () => {
    serve([UPCOMING, FAR, PAST])
    await enter()

    expect(titles()).toHaveLength(2)
    expect(groupRow().textContent).toContain('1 évènement passé')
    expect(groupRow().getAttribute('aria-expanded')).toBe('false')
  })

  it('n’affiche aucune ligne de groupe quand rien n’est passé', async () => {
    serve([UPCOMING, FAR])
    await enter()

    expect(screen.queryByRole('button', { name: /passé/ })).toBeNull()
  })

  it('déplie et replie d’un geste, au clavier comme à la souris', async () => {
    serve([UPCOMING, PAST])
    await enter()

    fireEvent.click(groupRow())
    expect(groupRow().getAttribute('aria-expanded')).toBe('true')
    expect(titles()).toHaveLength(2)

    fireEvent.click(groupRow())
    expect(groupRow().getAttribute('aria-expanded')).toBe('false')
    expect(titles()).toHaveLength(1)
  })

  it('conserve l’état déplié d’une visite à l’autre', async () => {
    serve([UPCOMING, PAST])
    await enter()
    fireEvent.click(groupRow())

    expect(window.localStorage.getItem('lehub.admin.archivedExpanded.events')).toBe('true')
  })

  it('s’affiche replié quand aucune préférence n’a été posée', async () => {
    // Le critère de #174 : l'absence de préférence n'empêche pas l'écran de s'afficher.
    window.localStorage.clear()
    serve([UPCOMING, PAST])
    await enter()

    expect(groupRow().getAttribute('aria-expanded')).toBe('false')
  })

  it('annonce séparément les à-venir et les passés', async () => {
    serve([UPCOMING, FAR, PAST])
    await enter()

    expect(screen.getByRole('status').textContent).toBe('2 évènements à venir · 1 passé')
  })
})

describe('tri et recherche à travers le repli', () => {
  it('applique le tri à l’ensemble et réordonne les deux groupes', async () => {
    // Le tri est **global** : descendant, le plus lointain passe en tête des à-venir, et le
    // groupe replié est réordonné lui aussi plutôt que trié pour son compte.
    const older: AdminEvent = { ...PAST, id: 'E6', title: 'Plus ancien', startDate: '2026-01-05T09:00:00.000Z', endDate: '2026-01-05T17:00:00.000Z' }
    serve([UPCOMING, FAR, PAST, older])
    await enter()

    fireEvent.click(
      within(within(screen.getByRole('table')).getByRole('columnheader', { name: /Début/ })).getByRole('button'),
    )
    fireEvent.click(groupRow())

    expect(titles().map((title) => title.slice(0, 11))).toEqual([
      'Soirée comm',
      'Azure Deep ',
      'Rétrospecti',
      'Plus ancien',
    ])
  })

  it('déplie le groupe dès qu’une recherche est en cours', async () => {
    // Sans cela, chercher un évènement de l'an dernier serait impossible.
    serve([UPCOMING, PAST])
    await enter()
    expect(groupRow().getAttribute('aria-expanded')).toBe('false')

    search('rétrospective')

    expect(groupRow().getAttribute('aria-expanded')).toBe('true')
    expect(titles().join(' ')).toContain('Rétrospective')
  })

  it('montre l’état vide du groupe à venir quand la recherche ne touche que le passé', async () => {
    serve([UPCOMING, PAST])
    await enter()

    search('rétrospective')

    expect(screen.getByText('Aucun évènement à venir ne correspond à cette recherche.')).toBeTruthy()
  })

  it('revient à la préférence conservée quand la recherche est effacée', async () => {
    serve([UPCOMING, PAST])
    await enter()

    search('rétro')
    expect(groupRow().getAttribute('aria-expanded')).toBe('true')

    search('')
    // La préférence n'a jamais bougé : il n'y a rien à restaurer.
    expect(groupRow().getAttribute('aria-expanded')).toBe('false')
  })

  it('garde la ligne de groupe offerte quand tous les évènements sont passés', async () => {
    serve([PAST])
    await enter()

    expect(screen.getByText('Aucun évènement à venir.')).toBeTruthy()
    expect(groupRow()).toBeTruthy()
  })
})

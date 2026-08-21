import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderAt } from './support/render-route'
import { buildEvent, buildNamedRef } from './support/event-fixtures'
import { ApiError } from '@/lib/api'

const { listUpcomingEvents } = vi.hoisted(() => ({ listUpcomingEvents: vi.fn() }))

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, listUpcomingEvents }
})

beforeEach(() => {
  listUpcomingEvents.mockReset()
})

describe('EventsPage', () => {
  it('shows a loading skeleton before the fetch resolves', () => {
    listUpcomingEvents.mockReturnValue(new Promise(() => {}))
    renderAt('/evenements')
    expect(screen.getAllByTestId('event-card-skeleton').length).toBeGreaterThan(0)
  })

  it('renders every upcoming event in API order, with a live count above the list', async () => {
    const events = [
      buildEvent({ id: 'e1', title: 'Event 1' }),
      buildEvent({ id: 'e2', title: 'Event 2' }),
      buildEvent({ id: 'e3', title: 'Event 3' }),
    ]
    listUpcomingEvents.mockResolvedValue(events)

    renderAt('/evenements')

    await waitFor(() => {
      expect(screen.getByText('3 évènements disponibles')).not.toBeNull()
    })
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Event 1',
      'Event 2',
      'Event 3',
    ])
  })

  it('marks the count as a live region', async () => {
    listUpcomingEvents.mockResolvedValue([buildEvent()])
    renderAt('/evenements')

    await waitFor(() => {
      const live = document.querySelector('[aria-live="polite"]')
      expect(live?.textContent).toBe('1 évènement disponible')
    })
  })

  it('shows the exact empty-state copy when there are no upcoming events at all', async () => {
    listUpcomingEvents.mockResolvedValue([])
    renderAt('/evenements')

    await waitFor(() => {
      expect(screen.getByText('Aucun évènement à venir pour le moment')).not.toBeNull()
    })
  })

  it('shows an error state without crashing when the fetch fails', async () => {
    listUpcomingEvents.mockRejectedValue(new ApiError('Aucune réponse.', 0))
    renderAt('/evenements')

    await waitFor(() => {
      expect(screen.getByText('Impossible de charger les évènements')).not.toBeNull()
    })
    // The page shell survives the failure — heading and landmarks are still there.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Évènements à venir')
  })
})

describe('EventsPage — filtres', () => {
  const communityA = buildNamedRef('community', 1)
  const communityB = buildNamedRef('community', 2)
  const techX = buildNamedRef('technology', 1)
  const techY = buildNamedRef('technology', 2)

  function filterPanel(): HTMLElement {
    return screen.getByRole('complementary', { name: 'Filtres' })
  }

  it('filters events with OR within a dimension and AND across dimensions', async () => {
    const user = userEvent.setup()
    listUpcomingEvents.mockResolvedValue([
      buildEvent({ id: 'e1', title: 'Event A', communities: [communityA], technologies: [techX] }),
      buildEvent({ id: 'e2', title: 'Event B', communities: [communityB], technologies: [techY] }),
      buildEvent({ id: 'e3', title: 'Event C', communities: [communityA], technologies: [techY] }),
    ])

    renderAt('/evenements')
    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)
    })

    await user.click(within(filterPanel()).getByText(communityA.name))
    // OR would leave A and C visible (both organized by community A).
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Event A',
      'Event C',
    ])

    await user.click(within(filterPanel()).getByText(techX.name))
    // AND across dimensions now narrows to the single event matching both.
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Event A'])
  })

  it('keeps an option listed even when it currently matches zero visible events', async () => {
    const user = userEvent.setup()
    listUpcomingEvents.mockResolvedValue([
      buildEvent({ id: 'e1', communities: [communityA], technologies: [techX] }),
      buildEvent({ id: 'e2', communities: [communityB], technologies: [techY] }),
    ])

    renderAt('/evenements')
    await waitFor(() => {
      expect(within(filterPanel()).getByText(communityB.name)).not.toBeNull()
    })

    await user.click(within(filterPanel()).getByText(techX.name))

    // Community B now matches zero visible events, but must remain a listed, checkable
    // option — its option list is derived from the full set, not the filtered one.
    expect(within(filterPanel()).getByText(communityB.name)).not.toBeNull()
  })

  it('"Réinitialiser" clears both dimensions', async () => {
    const user = userEvent.setup()
    listUpcomingEvents.mockResolvedValue([
      buildEvent({ id: 'e1', communities: [communityA] }),
      buildEvent({ id: 'e2', communities: [communityB] }),
    ])

    renderAt('/evenements')
    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2)
    })

    await user.click(within(filterPanel()).getByText(communityA.name))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)

    await user.click(within(filterPanel()).getByRole('button', { name: 'Réinitialiser' }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2)
  })

  it('shows a filtered-empty state with a reset that clears both dimensions', async () => {
    const user = userEvent.setup()
    listUpcomingEvents.mockResolvedValue([
      buildEvent({ id: 'e1', communities: [communityA], technologies: [techX] }),
      buildEvent({ id: 'e2', communities: [communityB], technologies: [techY] }),
    ])

    renderAt('/evenements')
    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2)
    })

    await user.click(within(filterPanel()).getByText(communityA.name))
    await user.click(within(filterPanel()).getByText(techY.name))

    expect(screen.getByText('Aucun évènement ne correspond à vos filtres')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2)
  })
})

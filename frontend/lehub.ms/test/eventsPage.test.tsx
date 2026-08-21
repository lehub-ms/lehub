import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderAt } from './support/render-route'
import { buildEvent } from './support/event-fixtures'
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

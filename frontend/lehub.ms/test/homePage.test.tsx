import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

describe('HomePage — prochains évènements', () => {
  it('shows a loading skeleton before the fetch resolves', () => {
    listUpcomingEvents.mockReturnValue(new Promise(() => {}))
    renderAt('/')
    expect(screen.getAllByTestId('event-card-skeleton')).toHaveLength(3)
  })

  it('shows at most the first three upcoming events, in API order', async () => {
    const events = Array.from({ length: 5 }, (_, index) =>
      buildEvent({ id: `e${index}`, title: `Event ${index}` }),
    )
    listUpcomingEvents.mockResolvedValue(events)

    renderAt('/')

    await waitFor(() => {
      expect(screen.queryAllByTestId('event-card-skeleton')).toHaveLength(0)
    })
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Event 0',
      'Event 1',
      'Event 2',
    ])
  })

  it('renders exactly the available events when there are fewer than three, with no filler', async () => {
    listUpcomingEvents.mockResolvedValue([buildEvent({ id: 'e1' })])

    renderAt('/')

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
    })
  })

  it('navigates to /evenements from "Tout voir"', async () => {
    const user = userEvent.setup()
    listUpcomingEvents.mockResolvedValue([buildEvent()])

    const { router } = renderAt('/')
    await waitFor(() => {
      expect(screen.queryAllByTestId('event-card-skeleton')).toHaveLength(0)
    })

    await user.click(screen.getByRole('link', { name: 'Tout voir' }))

    expect(router.state.location.pathname).toBe('/evenements')
  })

  it('shows an empty state with a still-functional "Tout voir" button when there are no upcoming events', async () => {
    listUpcomingEvents.mockResolvedValue([])

    renderAt('/')

    await waitFor(() => {
      expect(screen.getByText('Aucun évènement à venir pour le moment')).not.toBeNull()
    })
    const link = screen.getByRole('link', { name: 'Tout voir' })
    expect(link.getAttribute('href')).toBe('/evenements')
  })

  it('shows an error state without crashing when the fetch fails', async () => {
    listUpcomingEvents.mockRejectedValue(new ApiError('Aucune réponse.', 0))

    renderAt('/')

    await waitFor(() => {
      expect(screen.getByText('Impossible de charger les évènements')).not.toBeNull()
    })
  })
})

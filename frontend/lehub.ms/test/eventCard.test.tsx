import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { EventCard } from '@/components/events/EventCard'
import { buildEvent, buildNamedRef } from './support/event-fixtures'

describe('EventCard', () => {
  it('renders the format and mode badges', () => {
    render(<EventCard event={buildEvent({ format: 'Meetup', mode: 'Hybride' })} />)
    expect(screen.getByText('Meetup')).not.toBeNull()
    expect(screen.getByText('Hybride')).not.toBeNull()
  })

  it('renders the title as a level-3 heading', () => {
    render(<EventCard event={buildEvent({ title: 'Azure Community Day' })} />)
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Azure Community Day')
  })

  it('renders the description when present', () => {
    render(<EventCard event={buildEvent({ description: 'Une description courte.' })} />)
    expect(screen.getByText('Une description courte.')).not.toBeNull()
  })

  it('omits the description line entirely when absent', () => {
    const { container } = render(<EventCard event={buildEvent({ description: null })} />)
    // The card has exactly one <p> left: the date/time line.
    expect(container.querySelectorAll('p')).toHaveLength(1)
  })

  it('renders the date range', () => {
    render(
      <EventCard
        event={buildEvent({ startDate: '2026-03-15T18:00:00', endDate: '2026-03-15T20:00:00' })}
      />,
    )
    expect(screen.getByText(/18:00 → 20:00/)).not.toBeNull()
  })

  it('shows a single avatar and name for one organizing community', () => {
    const community = buildNamedRef('community', 1)
    render(<EventCard event={buildEvent({ communities: [community] })} />)
    expect(screen.getByText(community.name)).not.toBeNull()
  })

  it('shows a stacked-avatar accessible summary for several organizing communities', () => {
    const communities = [buildNamedRef('community', 1), buildNamedRef('community', 2)]
    render(<EventCard event={buildEvent({ communities })} />)
    const stack = screen.getByRole('img', { name: /Organisé par/ })
    expect(stack.getAttribute('aria-label')).toBe(
      `Organisé par : ${communities.map((c) => c.name).join(', ')}`,
    )
  })

  it('renders a technology pill per associated technology', () => {
    const technologies = [buildNamedRef('technology', 1), buildNamedRef('technology', 2)]
    render(<EventCard event={buildEvent({ technologies })} />)
    for (const tech of technologies) {
      expect(screen.getByText(tech.name)).not.toBeNull()
    }
  })

  it('omits the technology block entirely when there are none', () => {
    const { container } = render(<EventCard event={buildEvent({ technologies: [] })} />)
    expect(within(container).queryAllByText(/technology/)).toHaveLength(0)
  })

  it('is not an interactive element — no link or button role', () => {
    render(<EventCard event={buildEvent()} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

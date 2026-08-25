import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
    // `Z`-suffixed UTC, matching what the API actually returns — a timezone-less local
    // string parses relative to the *system* timezone, which differs between a dev
    // machine and the CI runner (UTC) and silently shifts the displayed hour.
    // 17:00/19:00 UTC is 18:00/20:00 in the `Europe/Paris` zone `formatEventDateRange`
    // pins its display to (CET, +1 — mid-March is still before the DST switch).
    render(
      <EventCard
        event={buildEvent({ startDate: '2026-03-15T17:00:00.000Z', endDate: '2026-03-15T19:00:00.000Z' })}
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

  describe('bannière', () => {
    const BANNER_URL = 'https://media.example/events/banner.svg'

    function banner(container: HTMLElement): HTMLImageElement | null {
      return container.querySelector<HTMLImageElement>('article > div > img')
    }

    it('renders the banner as an image, not a CSS background — only an image reports a failed load', () => {
      const { container } = render(<EventCard event={buildEvent({ bannerImageUrl: BANNER_URL })} />)
      expect(banner(container)?.getAttribute('src')).toBe(BANNER_URL)
      // Decorative: the <h3> already names the event.
      expect(banner(container)?.getAttribute('alt')).toBe('')
    })

    it('falls back to the gradient when the banner fails to load', () => {
      const { container } = render(<EventCard event={buildEvent({ bannerImageUrl: BANNER_URL })} />)
      const image = banner(container)
      expect(image).not.toBeNull()

      fireEvent.error(image!)

      expect(banner(container)).toBeNull()
      // The gradient was never conditional — it is painted underneath, so removing the
      // image reveals it rather than leaving an empty frame.
      const frame = container.querySelector<HTMLElement>('article > div')
      expect(frame?.style.background).toMatch(/^linear-gradient\(135deg,/)
    })

    it('renders no banner image at all when the event declares none', () => {
      const { container } = render(<EventCard event={buildEvent({ bannerImageUrl: null })} />)
      expect(banner(container)).toBeNull()
      const frame = container.querySelector<HTMLElement>('article > div')
      expect(frame?.style.background).toMatch(/^linear-gradient\(135deg,/)
    })
  })

  it('is not an interactive element — no link or button role', () => {
    render(<EventCard event={buildEvent()} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

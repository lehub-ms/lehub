import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventFilterPanel } from '@/components/events/EventFilterPanel'
import { EMPTY_FILTER_SELECTION } from '@/lib/eventFilters'
import { buildNamedRef } from './support/event-fixtures'

const communities = [buildNamedRef('community', 1), buildNamedRef('community', 2)]
const technologies = [buildNamedRef('technology', 1)]

describe('EventFilterPanel', () => {
  it('renders both dimensions flat, not as an accordion', () => {
    render(
      <EventFilterPanel
        options={{ communities, technologies }}
        selection={EMPTY_FILTER_SELECTION}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )

    expect(screen.getByText('Communauté')).not.toBeNull()
    expect(screen.getByText('Technologie')).not.toBeNull()
    expect(screen.getAllByRole('checkbox')).toHaveLength(communities.length + technologies.length)
  })

  it('exposes real checkbox semantics', () => {
    render(
      <EventFilterPanel
        options={{ communities, technologies }}
        selection={{ communityIds: [communities[0]!.id], technologyIds: [] }}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )

    const [first] = screen.getAllByRole('checkbox')
    expect(first?.getAttribute('aria-checked')).toBe('true')
  })

  it('renders nothing when both dimensions have no options', () => {
    const { container } = render(
      <EventFilterPanel
        options={{ communities: [], technologies: [] }}
        selection={EMPTY_FILTER_SELECTION}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('"Réinitialiser" is always visible and clears both dimensions', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    render(
      <EventFilterPanel
        options={{ communities, technologies }}
        selection={EMPTY_FILTER_SELECTION}
        onChange={vi.fn()}
        onReset={onReset}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    expect(onReset).toHaveBeenCalledOnce()
  })

  it('shows a technology row with the same initial-in-circle shape as a community row', () => {
    render(
      <EventFilterPanel
        options={{ communities, technologies }}
        selection={EMPTY_FILTER_SELECTION}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )

    // Both are initials of their fixtures' names ("community 1"/"2" and "technology
    // 1") — a flat color square, unlike the community avatar, would render no text at
    // all here. Both community fixtures share the initial "C", hence `getAllByText`.
    expect(screen.getAllByText('C', { selector: 'span' }).length).toBeGreaterThan(0)
    expect(screen.getByText('T', { selector: 'span' })).not.toBeNull()
  })

  it('toggles a community on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <EventFilterPanel
        options={{ communities, technologies }}
        selection={EMPTY_FILTER_SELECTION}
        onChange={onChange}
        onReset={vi.fn()}
      />,
    )

    await user.click(screen.getByText(communities[0]!.name))
    expect(onChange).toHaveBeenCalledWith({ communityIds: [communities[0]!.id], technologyIds: [] })
  })
})

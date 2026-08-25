import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventFilterDrawer } from '@/components/events/EventFilterDrawer'
import { EMPTY_FILTER_SELECTION } from '@/lib/eventFilters'
import { buildNamedRef } from './support/event-fixtures'
import { resetViewport, setPrefersReducedMotion } from './setup'

// Radix puts `pointer-events: none` on <body> while the dialog is open, which
// user-event refuses to click through — same guard as navbar.test.tsx.
const user = userEvent.setup({ pointerEventsCheck: 0 })

const communities = [buildNamedRef('community', 1), buildNamedRef('community', 2)]
const technologies = [buildNamedRef('technology', 1)]

function trigger(): HTMLElement {
  return screen.getByRole('button', { name: /Filtrer/ })
}

async function openDrawer(): Promise<HTMLElement> {
  await user.click(trigger())
  return screen.findByRole('dialog')
}

afterEach(() => {
  resetViewport()
})

describe('EventFilterDrawer', () => {
  it('renders nothing when both dimensions have no options', () => {
    const { container } = render(
      <EventFilterDrawer
        options={{ communities: [], technologies: [] }}
        selection={EMPTY_FILTER_SELECTION}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows no badge when no filter is active, and the sum of both dimensions otherwise', () => {
    const { rerender } = render(
      <EventFilterDrawer
        options={{ communities, technologies }}
        selection={EMPTY_FILTER_SELECTION}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(within(trigger()).queryByText('2')).toBeNull()

    rerender(
      <EventFilterDrawer
        options={{ communities, technologies }}
        selection={{ communityIds: [communities[0]!.id, communities[1]!.id], technologyIds: [technologies[0]!.id] }}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(within(trigger()).getByText('3')).not.toBeNull()
  })

  it('opens the dialog and moves focus to the close button', async () => {
    render(
      <EventFilterDrawer
        options={{ communities, technologies }}
        selection={EMPTY_FILTER_SELECTION}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    const dialog = await openDrawer()

    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Fermer les filtres' }))
  })

  it('closes on Escape and restores focus to the trigger', async () => {
    render(
      <EventFilterDrawer
        options={{ communities, technologies }}
        selection={EMPTY_FILTER_SELECTION}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    const triggerButton = trigger()
    await openDrawer()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(triggerButton)
  })

  it('closes on a backdrop click', async () => {
    render(
      <EventFilterDrawer
        options={{ communities, technologies }}
        selection={EMPTY_FILTER_SELECTION}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    await openDrawer()

    await user.click(screen.getByTestId('filter-backdrop'))

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('locks background scroll while open and restores it on close', async () => {
    render(
      <EventFilterDrawer
        options={{ communities, technologies }}
        selection={EMPTY_FILTER_SELECTION}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(document.body.style.overflow).not.toBe('hidden')

    await openDrawer()
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('opens one accordion section at a time', async () => {
    render(
      <EventFilterDrawer
        options={{ communities, technologies }}
        selection={EMPTY_FILTER_SELECTION}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    const dialog = await openDrawer()

    const communityTrigger = within(dialog).getByRole('button', { name: /Communauté/ })
    const technologyTrigger = within(dialog).getByRole('button', { name: /Technologie/ })

    expect(communityTrigger.getAttribute('data-state')).toBe('open')
    expect(technologyTrigger.getAttribute('data-state')).toBe('closed')

    await user.click(technologyTrigger)

    expect(communityTrigger.getAttribute('data-state')).toBe('closed')
    expect(technologyTrigger.getAttribute('data-state')).toBe('open')
  })

  it('shows a per-section "Effacer" only when that dimension has a selection, and it clears only that dimension', async () => {
    const onChange = vi.fn()
    render(
      <EventFilterDrawer
        options={{ communities, technologies }}
        selection={{ communityIds: [communities[0]!.id], technologyIds: [] }}
        onChange={onChange}
        onReset={vi.fn()}
      />,
    )
    const dialog = await openDrawer()

    // Both "Effacer" buttons are always in the DOM now — the chevron's position must
    // not depend on conditional mounting — but only the one for a dimension with an
    // active selection is visible (`invisible` rather than unmounted; jsdom applies no
    // real stylesheet, so this is asserted via the class, not computed visibility).
    const [communityClear, technologyClear] = within(dialog).getAllByRole('button', { name: 'Effacer' })
    expect(communityClear?.className).not.toMatch(/invisible/)
    expect(technologyClear?.className).toMatch(/invisible/)

    await user.click(communityClear!)
    expect(onChange).toHaveBeenCalledWith({ communityIds: [], technologyIds: [] })
  })

  it('shows no footer at all at zero active filters — the × already closes the drawer', async () => {
    const onReset = vi.fn()
    const { rerender } = render(
      <EventFilterDrawer
        options={{ communities, technologies }}
        selection={EMPTY_FILTER_SELECTION}
        onChange={vi.fn()}
        onReset={onReset}
      />,
    )
    let dialog = await openDrawer()
    expect(within(dialog).queryByRole('button', { name: 'Effacer tout' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: /Appliquer/ })).toBeNull()
    await user.keyboard('{Escape}')

    rerender(
      <EventFilterDrawer
        options={{ communities, technologies }}
        selection={{ communityIds: [communities[0]!.id], technologyIds: [] }}
        onChange={vi.fn()}
        onReset={onReset}
      />,
    )
    dialog = await openDrawer()
    expect(within(dialog).getByRole('button', { name: 'Appliquer (1)' })).not.toBeNull()

    await user.click(within(dialog).getByRole('button', { name: 'Effacer tout' }))

    expect(onReset).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('"Appliquer" only closes the drawer', async () => {
    render(
      <EventFilterDrawer
        options={{ communities, technologies }}
        selection={{ communityIds: [communities[0]!.id], technologyIds: [] }}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    const dialog = await openDrawer()

    await user.click(within(dialog).getByRole('button', { name: 'Appliquer (1)' }))

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows a technology row with the same initial-in-circle shape as a community row', async () => {
    render(
      <EventFilterDrawer
        options={{ communities, technologies }}
        selection={EMPTY_FILTER_SELECTION}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    const dialog = await openDrawer()

    // Both are initials of their fixtures' names ("community 1"/"2" and "technology
    // 1") — a flat color square, unlike the community avatar, would render no text at
    // all here. Both community fixtures share the initial "C", hence `getAllByText`.
    expect(within(dialog).getAllByText('C', { selector: 'span' }).length).toBeGreaterThan(0)
    await user.click(within(dialog).getByRole('button', { name: /Technologie/ }))
    expect(within(dialog).getByText('T', { selector: 'span' })).not.toBeNull()
  })

  it('shows an option\u2019s logo in the drawer rows and in the collapsed-section summary chips', async () => {
    const withLogo = buildNamedRef('community', 3, 'https://media.example/communities/three.svg')
    render(
      <EventFilterDrawer
        options={{ communities: [withLogo], technologies }}
        selection={{ communityIds: [withLogo.id], technologyIds: [] }}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    const dialog = await openDrawer()

    // One image in the expanded row, one in the trigger's summary chip.
    const images = [...dialog.querySelectorAll<HTMLImageElement>('img')]
    expect(images.length).toBe(2)
    for (const image of images) expect(image.getAttribute('src')).toBe(withLogo.logoUrl)
  })

  describe('glisser pour fermer', () => {
    it('below the threshold snaps back open', async () => {
      render(
        <EventFilterDrawer
          options={{ communities, technologies }}
          selection={EMPTY_FILTER_SELECTION}
          onChange={vi.fn()}
          onReset={vi.fn()}
        />,
      )
      const dialog = await openDrawer()
      const handle = dialog.firstElementChild as HTMLElement

      fireDrag(handle, 40)

      expect(screen.queryByRole('dialog')).not.toBeNull()
    })

    it('at or above the threshold closes the drawer', async () => {
      render(
        <EventFilterDrawer
          options={{ communities, technologies }}
          selection={EMPTY_FILTER_SELECTION}
          onChange={vi.fn()}
          onReset={vi.fn()}
        />,
      )
      await openDrawer()
      const dialog = screen.getByRole('dialog')
      const handle = dialog.firstElementChild as HTMLElement

      fireDrag(handle, 120)

      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('still closes synchronously with prefers-reduced-motion, without depending on a CSS transition', async () => {
      setPrefersReducedMotion(true)
      render(
        <EventFilterDrawer
          options={{ communities, technologies }}
          selection={EMPTY_FILTER_SELECTION}
          onChange={vi.fn()}
          onReset={vi.fn()}
        />,
      )
      await openDrawer()
      const dialog = screen.getByRole('dialog')
      const handle = dialog.firstElementChild as HTMLElement

      fireDrag(handle, 120)

      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})

/**
 * Simulates a vertical pointer drag of `deltaY` px on the drawer's drag handle.
 * Dispatched outside React's synthetic event system (a raw DOM dispatch, not a
 * user-event click), so the resulting state updates need an explicit `act()` —
 * same reasoning as `navbar.test.tsx`'s `setDesktopViewport`.
 */
function fireDrag(handle: HTMLElement, deltaY: number) {
  handle.setPointerCapture = () => undefined
  act(() => {
    handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 0, pointerId: 1 }))
    handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: deltaY, pointerId: 1 }))
    handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: deltaY, pointerId: 1 }))
  })
}

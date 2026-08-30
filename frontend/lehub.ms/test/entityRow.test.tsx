import { StrictMode } from 'react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EntityRow } from '@/components/events/EntityRow'
import type { EntityKind } from '@lehub/shared/components/entities/EntityAvatar'
import { buildNamedRef } from './support/event-fixtures'
import { installFakeLayout, setAvailableWidth } from './support/fake-layout'
import { settleFonts, triggerResizeObservers } from './setup'

// Radix puts `pointer-events: none` on <body> while a layer is open.
const user = userEvent.setup({ pointerEventsCheck: 0 })

/**
 * Under `StrictMode`, exactly like `main.tsx` mounts the app — not a detail here: it
 * double-invokes the measuring layout effect against the same, not-yet-re-rendered DOM,
 * and a descent step that compounded across the two invocations would drop one avatar too
 * many on every real page while looking perfectly correct in a bare render.
 */
function render(ui: ReactElement) {
  return rtlRender(<StrictMode>{ui}</StrictMode>)
}

let restoreLayout: () => void

beforeEach(() => {
  restoreLayout = installFakeLayout()
})

afterEach(() => {
  restoreLayout()
})

function refs(kind: string, count: number) {
  return Array.from({ length: count }, (_, index) => buildNamedRef(kind, index + 1))
}

function row(): HTMLElement {
  return screen.getByTestId('entity-row')
}

/**
 * The rule is required to be strictly identical for both dimensions, so the layout cases
 * are asserted for both rather than for communities alone.
 */
const DIMENSIONS: readonly { kind: EntityKind; label: string }[] = [
  { kind: 'community', label: 'Organisé par' },
  { kind: 'technology', label: 'Technologies abordées' },
]

describe.each(DIMENSIONS)('EntityRow — $kind', ({ kind, label }) => {
  it('shows full pills, with every name readable, when they all fit', () => {
    const entities = refs(kind, 2)
    setAvailableWidth(600)
    render(<EntityRow entities={entities} kind={kind} label={label} />)

    expect(row().dataset['fitMode']).toBe('full')
    for (const entity of entities) expect(screen.getByText(entity.name)).not.toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('names the dimension in both modes — the pills alone would not say which it is', () => {
    setAvailableWidth(600)
    const { rerender } = render(<EntityRow entities={refs(kind, 2)} kind={kind} label={label} />)
    expect(screen.getByRole('group', { name: label })).toBe(row())

    setAvailableWidth(80)
    rerender(<EntityRow entities={refs(kind, 5)} kind={kind} label={label} />)
    expect(row().dataset['fitMode']).toBe('logos')
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain(label)
  })

  it('falls back to the logos alone, side by side on one line, rather than wrapping', () => {
    const entities = refs(kind, 4)
    setAvailableWidth(120)
    render(<EntityRow entities={entities} kind={kind} label={label} />)

    expect(row().dataset['fitMode']).toBe('logos')
    expect(row().querySelectorAll('[data-avatar]')).toHaveLength(4)
    expect(row().querySelector('[data-more]')).toBeNull()
    for (const entity of entities) expect(screen.queryByText(entity.name)).toBeNull()
  })

  it('drops to as many logos as fit and ends with a "+N" for the rest', () => {
    const entities = refs(kind, 6)
    setAvailableWidth(60)
    render(<EntityRow entities={entities} kind={kind} label={label} />)

    const shown = row().querySelectorAll('[data-avatar]').length
    expect(shown).toBeLessThan(entities.length)
    expect(row().querySelector('[data-more]')?.textContent).toBe(`+${entities.length - shown}`)
  })
})

describe('EntityRow — la liste réduite reste consultable', () => {
  const entities = refs('community', 4)
  const label = 'Organisé par'

  function renderLogosOnly() {
    setAvailableWidth(120)
    return render(<EntityRow entities={entities} kind="community" label={label} />)
  }

  it('names every entity in the row’s accessible name, without opening anything', () => {
    renderLogosOnly()
    const trigger = screen.getByRole('button')
    expect(trigger.getAttribute('aria-label')).toBe(
      `${label} : ${entities.map((entity) => entity.name).join(', ')}`,
    )
  })

  it('lists every entity with its name on activation — the tap and keyboard path', async () => {
    renderLogosOnly()
    // A bare click, with no hover before it: that is a tap, and an Enter/Space activation.
    // `user.click` would hover first and so could only ever exercise the mouse path.
    fireEvent.click(screen.getByRole('button'))

    const panel = await screen.findByRole('dialog')
    for (const entity of entities) expect(within(panel).getByText(entity.name)).not.toBeNull()
  })

  it('opens on mouse hover, and leaves the focus where it was', async () => {
    renderLogosOnly()
    const trigger = screen.getByRole('button')

    await user.hover(trigger)

    const panel = await screen.findByRole('dialog')
    // Hover must never steal the focus; the trigger's own aria-label already carries the
    // whole list, so nothing is lost by staying put.
    expect(document.activeElement).not.toBe(panel)
  })

  it('ignores a touch pointerenter, which would otherwise fight the tap that follows it', () => {
    renderLogosOnly()

    fireEvent.pointerOver(screen.getByRole('button'), { pointerType: 'touch' })

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Escape', async () => {
    renderLogosOnly()
    fireEvent.click(screen.getByRole('button'))
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('EntityRow — convergence', () => {
  it('grows the pills back when its column widens, which no window resize would report', () => {
    const entities = refs('technology', 3)
    setAvailableWidth(100)
    render(<EntityRow entities={entities} kind="technology" label="Technologies abordées" />)
    expect(row().dataset['fitMode']).toBe('logos')

    setAvailableWidth(800)
    act(() => {
      triggerResizeObservers()
    })

    expect(row().dataset['fitMode']).toBe('full')
    for (const entity of entities) expect(screen.getByText(entity.name)).not.toBeNull()
  })

  it('measures again once the fonts have settled, which no resize would report either', async () => {
    const entities = refs('community', 3)
    setAvailableWidth(100)
    render(<EntityRow entities={entities} kind="community" label="Organisé par" />)
    expect(row().dataset['fitMode']).toBe('logos')

    // The real face swaps in for the `font-display: swap` fallback: the text changes
    // width while the row's own `w-full h-11` box does not, so the ResizeObserver is blind
    // to it and only this path can correct the measurement.
    setAvailableWidth(800)
    await act(async () => {
      await settleFonts()
    })

    expect(row().dataset['fitMode']).toBe('full')
  })

  it('holds the growth back while the trigger has focus, rather than dropping it to <body>', () => {
    const entities = refs('community', 3)
    setAvailableWidth(100)
    render(<EntityRow entities={entities} kind="community" label="Organisé par" />)
    const trigger = screen.getByRole('button')
    act(() => {
      trigger.focus()
    })

    setAvailableWidth(800)
    act(() => {
      triggerResizeObservers()
    })

    // Unmounting the focused trigger would send focus to <body>, and the next Tab would
    // restart from the top of the page.
    expect(row().dataset['fitMode']).toBe('logos')
    expect(document.activeElement).toBe(trigger)

    // …and the row grows back the moment focus leaves it.
    act(() => {
      fireEvent.blur(trigger, { relatedTarget: document.body })
    })

    expect(row().dataset['fitMode']).toBe('full')
    for (const entity of entities) expect(screen.getByText(entity.name)).not.toBeNull()
  })

  it('stops at one logo plus a "+N" instead of descending forever on a pathological width', () => {
    const entities = refs('community', 5)
    setAvailableWidth(10)
    render(<EntityRow entities={entities} kind="community" label="Organisé par" />)

    expect(row().querySelectorAll('[data-avatar]')).toHaveLength(1)
    expect(row().querySelector('[data-more]')?.textContent).toBe('+4')
  })

  it('keeps the same height in both modes, so a switch can never resize the card', () => {
    setAvailableWidth(600)
    const { rerender } = render(
      <EntityRow entities={refs('community', 2)} kind="community" label="Organisé par" />,
    )
    const fullClasses = row().className
    expect(row().dataset['fitMode']).toBe('full')

    setAvailableWidth(80)
    rerender(<EntityRow entities={refs('community', 5)} kind="community" label="Organisé par" />)
    expect(row().dataset['fitMode']).toBe('logos')

    expect(row().className.split(' ')).toContain('h-11')
    expect(fullClasses.split(' ')).toContain('h-11')
  })
})

describe('EntityRow — logos', () => {
  it('shows the logo of an entity that has one and the initial of one that does not, side by side', () => {
    const withLogo = buildNamedRef('community', 1, 'https://media.example/communities/one.svg')
    const withoutLogo = buildNamedRef('community', 2)
    setAvailableWidth(600)
    render(<EntityRow entities={[withLogo, withoutLogo]} kind="community" label="Organisé par" />)

    expect(row().querySelector('img')?.getAttribute('src')).toBe(withLogo.logoUrl)
    expect(screen.getByText('C')).not.toBeNull()
  })

  it('falls back to the initial when a logo fails to load, with no broken-image glyph', () => {
    const withLogo = buildNamedRef('technology', 1, 'https://media.example/technologies/one.svg')
    setAvailableWidth(600)
    render(<EntityRow entities={[withLogo]} kind="technology" label="Technologies abordées" />)

    fireEvent.error(row().querySelector('img')!)

    expect(row().querySelector('img')).toBeNull()
    expect(within(row()).getByText('T')).not.toBeNull()
    // The name was never carried by the image, so it survives the swap.
    expect(within(row()).getByText(withLogo.name)).not.toBeNull()
  })
})

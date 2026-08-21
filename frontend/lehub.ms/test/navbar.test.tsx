import { afterEach, describe, expect, it } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderAt } from './support/render-route'
import { resetViewport, setDesktopViewport } from './setup'
import { NAV_ITEMS } from '@/lib/navigation'

// Radix puts `pointer-events: none` on <body> while the dialog is open, which
// user-event refuses to click through. The guard is about real pointer occlusion, not
// about what we are asserting here.
const user = userEvent.setup({ pointerEventsCheck: 0 })

function mainNav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Navigation principale' })
}

function hamburger(): HTMLElement {
  return screen.getByRole('button', { name: /menu/i })
}

async function openDrawer(): Promise<HTMLElement> {
  await user.click(hamburger())
  // DismissableLayer registers its outside-click listener in a setTimeout(…, 0);
  // clicking outside before that lands is the classic flake here.
  return screen.findByRole('dialog')
}

afterEach(() => {
  resetViewport()
})

describe('en-tête', () => {
  it('affiche le logo et les trois rubriques', () => {
    renderAt('/')
    const nav = mainNav()

    expect(within(nav).getByText('Le').textContent).not.toBe('')
    for (const item of NAV_ITEMS) {
      expect(within(nav).getByRole('link', { name: item.label })).not.toBeNull()
    }
  })

  it('conserve le logo quand la navigation est repliée', async () => {
    renderAt('/')
    const nav = mainNav()
    const wordmark = within(nav).getByText('Le')

    await openDrawer()

    // The wordmark lives in the pill itself, not in a desktop-only branch, so it
    // survives the collapse rather than being re-rendered somewhere else.
    expect(nav.contains(wordmark)).toBe(true)
  })

  it.each([
    ['/', 'Accueil'],
    ['/evenements', 'Évènements'],
    ['/lehub', 'Le Hub'],
  ])('marque %s comme rubrique courante', (path, label) => {
    renderAt(path)
    const nav = mainNav()

    for (const item of NAV_ITEMS) {
      const link = within(nav).getByRole('link', { name: item.label })
      const expected = item.label === label ? 'page' : null
      expect(link.getAttribute('aria-current')).toBe(expected)
    }
  })

  it('navigue côté client depuis l’en-tête', async () => {
    const { router } = renderAt('/')

    await user.click(within(mainNav()).getByRole('link', { name: 'Évènements' }))

    expect(router.state.location.pathname).toBe('/evenements')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Évènements à venir')
  })
})

describe('tiroir mobile', () => {
  it('n’ouvre rien tant que le hamburger n’est pas actionné', () => {
    renderAt('/')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(hamburger().getAttribute('aria-expanded')).toBe('false')
  })

  it('ouvre une boîte de dialogue modale listant les trois rubriques', async () => {
    renderAt('/')
    const dialog = await openDrawer()

    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(within(dialog).getAllByRole('link')).toHaveLength(NAV_ITEMS.length)
  })

  it('place le focus sur le premier lien à l’ouverture', async () => {
    renderAt('/')
    const dialog = await openDrawer()

    // Radix picks its initial target with focusFirst(removeLinks(...)) — it skips
    // links. Without NavBar's onOpenAutoFocus override the panel would hold focus and
    // this is the assertion that would catch it.
    const [firstLink] = within(dialog).getAllByRole('link')
    expect(document.activeElement).toBe(firstLink)
  })

  it('piège le focus dans la boîte de dialogue', async () => {
    renderAt('/')
    const dialog = await openDrawer()
    const links = within(dialog).getAllByRole('link')
    const last = links.at(-1)
    const first = links.at(0)

    last?.focus()
    await user.tab()

    expect(document.activeElement).toBe(first)
  })

  it('ferme sur Échap et rend le focus au hamburger', async () => {
    renderAt('/')
    // Captured before opening: Radix aria-hides #root while the dialog is up, so role
    // queries can no longer reach the trigger.
    const trigger = hamburger()
    await openDrawer()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('ferme au clic sur le fond assombri', async () => {
    renderAt('/')
    await openDrawer()

    await user.click(screen.getByTestId('nav-backdrop'))

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('ferme au clic sur le hamburger', async () => {
    renderAt('/')
    const trigger = hamburger()
    await openDrawer()

    await user.click(trigger)

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('ferme et navigue au clic sur un lien', async () => {
    const { router } = renderAt('/')
    const dialog = await openDrawer()

    await user.click(within(dialog).getByRole('link', { name: 'Le Hub' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(router.state.location.pathname).toBe('/lehub')
  })

  it('ferme quand la fenêtre repasse au-dessus du seuil desktop', async () => {
    renderAt('/')
    await openDrawer()

    // Fired outside React's event system, so the resulting state update needs act().
    act(() => {
      setDesktopViewport(true)
    })

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

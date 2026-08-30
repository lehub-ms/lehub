import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isSectionActive, PATHS } from '@/lib/navigation'
import { renderAt } from './support/render-route'
import { GLOBAL_ADMIN } from './support/session-fixtures'
import { stubSignedIn } from './support/stub-session'

const COMMUNITY = 'C1C1C1C1-0000-0000-0000-000000000001'
const EVENTS = `/c/${COMMUNITY}/evenements`

/** La coquille ne se monte que derrière les gardes : il faut une session habilitée. */
async function renderShell(path = EVENTS) {
  stubSignedIn(GLOBAL_ADMIN)
  const rendered = renderAt(path)
  await screen.findByRole('navigation', { name: 'Navigation principale' })
  return rendered
}

function sidebarNav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Navigation principale' })
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  // Sans cela, un espion posé par un test qui échoue avant son `mockRestore` contamine
  // toute la suite — ce qui s'est produit et a fait tomber six tests d'un coup.
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('isSectionActive', () => {
  it('marque la route elle-même et ses enfants', () => {
    expect(isSectionActive(EVENTS, EVENTS)).toBe(true)
    // Le formulaire d'un évènement laisse « Évènements » actif.
    expect(isSectionActive(`${EVENTS}/nouveau`, EVENTS)).toBe(true)
    expect(isSectionActive(`${EVENTS}/abc-123`, EVENTS)).toBe(true)
  })

  it('ne déborde pas sur une route qui commence par le même texte', () => {
    // Sans la barre oblique finale, `/evenements-archives` passerait pour un enfant.
    expect(isSectionActive(`${EVENTS}-archives`, EVENTS)).toBe(false)
    expect(isSectionActive(PATHS.technologies, EVENTS)).toBe(false)
  })
})

describe('coquille du backoffice', () => {
  it('pose une navigation nommée, un contenu principal unique et un titre de niveau un', async () => {
    await renderShell()
    // Le contenu attend la liste des communautés : `CommunityScope` ne rend son `Outlet`
    // qu'une fois la communauté résolue, donc le titre arrive après la navigation.
    await screen.findByRole('heading', { level: 1 })

    expect(sidebarNav()).toBeTruthy()
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it("signale l'entrée de l'écran courant, routes enfants comprises", async () => {
    await renderShell(`${EVENTS}/nouveau`)

    const active = within(sidebarNav()).getByRole('link', { name: 'Évènements' })
    expect(active.getAttribute('aria-current')).toBe('page')
    // Une seule à la fois : deux entrées « courantes » ne veulent rien dire.
    expect(within(sidebarNav()).getAllByRole('link').filter((l) => l.getAttribute('aria-current'))).toHaveLength(1)
  })

  it('respecte le plancher tactile sur chaque entrée', async () => {
    await renderShell()
    for (const link of within(sidebarNav()).getAllByRole('link')) {
      expect(link.className, link.textContent ?? '').toContain('min-h-11')
    }
  })
})

describe('réduction de la barre latérale', () => {
  it('réduit, garde les libellés accessibles, et survit à un rechargement', async () => {
    const first = await renderShell()

    fireEvent.click(screen.getByRole('button', { name: 'Réduire le menu' }))

    // Réduite, l'entrée n'a plus de libellé visible mais garde son nom accessible.
    const link = within(sidebarNav()).getByRole('link', { name: 'Évènements' })
    expect(link.getAttribute('title')).toBe('Évènements')
    expect(link.textContent).toBe('')
    expect(screen.getByRole('button', { name: 'Déployer le menu' })).toBeTruthy()

    first.unmount()
    vi.unstubAllGlobals()

    // Rechargement : la préférence est relue au premier rendu, sans déplier puis replier.
    stubSignedIn(GLOBAL_ADMIN)
    renderAt(EVENTS)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Déployer le menu' })).toBeTruthy())
  })

  it("n'échoue pas quand le stockage est refusé", async () => {
    // Les espions sont posés *après* le stub de session, qui a besoin du stockage pour
    // déposer son jeton de rafraîchissement.
    stubSignedIn(GLOBAL_ADMIN)

    // Refus ciblé sur la seule préférence d'affichage : le jeton de rafraîchissement doit
    // rester lisible, sinon c'est la session qu'on empêche et non le stockage qu'on éprouve.
    // Un faux stockage complet plutôt qu'un renvoi vers le vrai, pour ne pas garder de
    // référence non liée aux méthodes du prototype.
    const store = new Map<string, string>([['lehub.auth.refreshToken', 'rt']])
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key.startsWith('lehub.admin.')) throw new Error('storage denied')
      return store.get(key) ?? null
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
      if (key.startsWith('lehub.admin.')) throw new Error('storage denied')
      store.set(key, value)
    })

    // Une préférence d'affichage illisible ne doit pas blanchir un backoffice.
    renderAt(EVENTS)
    await screen.findByRole('navigation', { name: 'Navigation principale' })
    fireEvent.click(screen.getByRole('button', { name: 'Réduire le menu' }))
    expect(screen.getByRole('button', { name: 'Déployer le menu' })).toBeTruthy()
  })
})

describe('tiroir mobile', () => {
  it("s'ouvre depuis la barre supérieure et rend une navigation complète", async () => {
    await renderShell()

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }))
    const drawer = await screen.findByRole('dialog')

    expect(drawer.getAttribute('aria-modal')).toBe('true')
    expect(within(drawer).getByRole('link', { name: 'Évènements' })).toBeTruthy()
    expect(within(drawer).getByRole('link', { name: 'Technologies' })).toBeTruthy()
  })

  it('ne laisse pas fuir la réduction du bureau dans le tiroir', async () => {
    await renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Réduire le menu' }))

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }))
    const drawer = await screen.findByRole('dialog')

    // Le tiroir occupe déjà sa pleine largeur : ses libellés restent visibles, et il n'y
    // propose aucun bouton de réduction.
    expect(within(drawer).getByRole('link', { name: 'Évènements' }).textContent).toBe('Évènements')
    // Ciblé sur le bouton de réduction : le bloc du compte porte lui aussi « le menu » dans
    // son nom accessible depuis #142, et un motif trop large capturerait le mauvais bouton.
    expect(within(drawer).queryByRole('button', { name: /(réduire|déployer) le menu/i })).toBeNull()
  })

  it('se referme par la touche d’échappement et rend le focus au bouton', async () => {
    await renderShell()
    const trigger = screen.getByRole('button', { name: 'Ouvrir le menu' })

    fireEvent.click(trigger)
    await screen.findByRole('dialog')

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('se referme au clic sur le fond', async () => {
    await renderShell()

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }))
    await screen.findByRole('dialog')

    fireEvent.pointerDown(screen.getByTestId('sidebar-backdrop'), { button: 0, ctrlKey: false })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('se referme à la navigation', async () => {
    const { router } = await renderShell()

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }))
    await screen.findByRole('dialog')

    // Une redirection, pas un clic : le tiroir se referme parce qu'il est dérivé de l'écran
    // sur lequel il a été ouvert, et non parce qu'un gestionnaire de clic y a pensé.
    await router.navigate(PATHS.technologies)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('constats de la revue', () => {
  it('ne rouvre pas le tiroir au retour arrière', async () => {
    const { router } = await renderShell()

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }))
    await screen.findByRole('dialog')

    await router.navigate(PATHS.technologies)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // Le défaut : le tiroir était dérivé de l'écran d'ouverture, donc y revenir rendait
    // l'égalité vraie une seconde fois et le tiroir modal resurgissait par-dessus la page.
    await router.navigate(-1)

    await waitFor(() => expect(router.state.location.pathname).toBe(EVENTS))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('mène aux évènements quand une adresse de communauté est tronquée', async () => {
    // `/c/<id>` n'a pas de section : sans route d'index, le joker ne capture pas un reste vide
    // et la zone de contenu restait blanche — pas même l'écran introuvable.
    const { router } = await renderShell(`/c/${COMMUNITY}`)

    await waitFor(() => expect(router.state.location.pathname).toBe(EVENTS))
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy()
  })

  it("ne pose pas deux fois le même identifiant dans le document", async () => {
    await renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }))
    await screen.findByRole('dialog')

    // La barre fixe n'est masquée que par CSS : les deux copies coexistent dans le document,
    // et un identifiant écrit en dur faisait pointer le `aria-labelledby` du tiroir sur le
    // titre de l'autre.
    const ids = Array.from(document.querySelectorAll('[id]')).map((node) => node.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

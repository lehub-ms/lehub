import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PATHS } from '@/lib/navigation'
import { renderAt } from './support/render-route'
import { ADMIN_AND_ORGANIZER, COMMUNITIES, GLOBAL_ADMIN, ORGANIZER, openedSession } from './support/session-fixtures'
import { jsonResponse, stubSignedIn } from './support/stub-session'
import type { SessionPermissions } from '@lehub/shared/auth/AuthContext'

const FIRST = COMMUNITIES[0]!
const SECOND = COMMUNITIES[1]!

async function enter(permissions: SessionPermissions, path = '/') {
  stubSignedIn(permissions)
  const rendered = renderAt(path)
  await screen.findByRole('navigation', { name: 'Navigation principale' })
  return rendered
}

/** Radix ouvre son menu au clavier comme à la souris ; l'entrée prouve les deux à la fois. */
async function openPicker(): Promise<HTMLElement> {
  // `find` et non `get` : le sélecteur n'apparaît qu'une fois la liste chargée, et l'attendre
  // ici évite de faire dépendre chaque test d'une redirection qui lui laisse le temps.
  const trigger = await screen.findByRole('button', { name: /changer de communauté/i })
  fireEvent.keyDown(trigger, { key: 'Enter' })
  return screen.findByRole('menu')
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('sélecteur de communauté', () => {
  it('propose toutes les communautés à un administrateur', async () => {
    await enter(GLOBAL_ADMIN)
    const menu = await openPicker()

    for (const community of COMMUNITIES) {
      expect(within(menu).getByRole('menuitemradio', { name: community.name })).toBeTruthy()
    }
  })

  it("ne propose à un organisateur que les communautés qu'il organise", async () => {
    await enter(ORGANIZER)

    // Attendre que le sélecteur soit rendu avant d'affirmer ce qu'il ne contient pas :
    // l'assertion négative serait autrement vraie pour la mauvaise raison.
    expect(await screen.findByText(FIRST.name)).toBeTruthy()
    // Une seule communauté organisée : pas de menu à ouvrir, l'edge case le demande.
    expect(screen.queryByRole('button', { name: /changer de communauté/i })).toBeNull()
    expect(screen.queryByText(SECOND.name)).toBeNull()
  })

  it("annonce l'élément sélectionné plutôt que de le peindre seulement", async () => {
    await enter(GLOBAL_ADMIN)
    const menu = await openPicker()

    const selected = within(menu).getByRole('menuitemradio', { name: FIRST.name })
    expect(selected.getAttribute('aria-checked')).toBe('true')
    expect(
      within(menu).getByRole('menuitemradio', { name: SECOND.name }).getAttribute('aria-checked'),
    ).toBe('false')
  })

  it("fait suivre l'URL en changeant de communauté, sans changer d'écran", async () => {
    const { router } = await enter(GLOBAL_ADMIN, `/c/${FIRST.id}/organisateurs`)
    const menu = await openPicker()

    fireEvent.click(within(menu).getByRole('menuitemradio', { name: SECOND.name }))

    // La section est conservée : on change de communauté, pas de sujet.
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/c/${SECOND.id}/organisateurs`),
    )
  })
})

describe("entrée du backoffice", () => {
  it('mène aux évènements de la première communauté autorisée', async () => {
    const { router } = await enter(GLOBAL_ADMIN)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/c/${FIRST.id}/evenements`),
    )
  })

  it('retrouve la dernière communauté utilisée après un rechargement', async () => {
    const first = await enter(GLOBAL_ADMIN, `/c/${SECOND.id}/evenements`)
    await waitFor(() => expect(window.localStorage.getItem('lehub.admin.communityId')).toBe(SECOND.id))
    first.unmount()
    vi.unstubAllGlobals()

    const { router } = await enter(GLOBAL_ADMIN)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/c/${SECOND.id}/evenements`),
    )
  })

  it('ignore une communauté mémorisée que la session n’organise plus', async () => {
    window.localStorage.setItem('lehub.admin.communityId', SECOND.id)

    // ORGANIZER n'organise que la première : la préférence n'est pas crue sur parole.
    const { router } = await enter(ORGANIZER)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/c/${FIRST.id}/evenements`),
    )
  })
})

describe('communauté de l’URL', () => {
  it('retombe sur la première autorisée quand elle est inconnue, sans erreur', async () => {
    const { router } = await enter(GLOBAL_ADMIN, '/c/00000000-dead-beef-0000-000000000000/evenements')

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/c/${FIRST.id}/evenements`),
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it("retombe aussi quand elle existe mais que la session ne l'organise pas", async () => {
    // Ce n'est pas la barrière : l'API refuse les écritures quoi qu'il arrive (#109).
    const { router } = await enter(ORGANIZER, `/c/${SECOND.id}/evenements`)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/c/${FIRST.id}/evenements`),
    )
  })

  it('reprend la communauté dans le titre de l’écran', async () => {
    await enter(GLOBAL_ADMIN, `/c/${SECOND.id}/evenements`)

    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('Évènements')
    // La puce de contexte accompagne le titre plutôt que de s'y fondre.
    expect(screen.getAllByText(SECOND.name).length).toBeGreaterThan(0)
  })

  it("laisse le titre sans communauté sur un écran d'administration générale", async () => {
    await enter(GLOBAL_ADMIN, PATHS.technologies)

    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('Technologies')
    // Le sélecteur reste visible mais ne pilote rien : il n'a pas disparu pour autant.
    expect(await screen.findByRole('button', { name: /changer de communauté/i })).toBeTruthy()
  })
})

describe('navigation restreinte aux habilitations', () => {
  it("n'offre l'administration générale qu'à un administrateur global", async () => {
    await enter(GLOBAL_ADMIN)
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })
    await waitFor(() => expect(within(nav).getByRole('link', { name: 'Évènements' })).toBeTruthy())

    for (const label of ['Communautés', 'Technologies', 'Administrateurs']) {
      expect(within(nav).getByRole('link', { name: label }), label).toBeTruthy()
    }
  })

  it("ne la propose pas à un organisateur, qui garde sa section communauté", async () => {
    await enter(ORGANIZER)
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })

    await waitFor(() => expect(within(nav).getByRole('link', { name: 'Évènements' })).toBeTruthy())
    for (const label of ['Communautés', 'Technologies', 'Administrateurs']) {
      expect(within(nav).queryByRole('link', { name: label }), label).toBeNull()
    }
    expect(within(nav).queryByText('Administration générale')).toBeNull()
  })

  it("refuse une route d'administration atteinte par URL, sans rien divulguer de l'écran", async () => {
    const { router } = await enter(ORGANIZER, PATHS.technologies)

    expect(await screen.findByRole('heading', { name: /réservée aux administrateurs/i })).toBeTruthy()
    // La garde est une route parente : l'écran visé n'est jamais monté, donc son titre non
    // plus. Masquer l'entrée dans la barre n'aurait été qu'un confort.
    expect(screen.queryByRole('heading', { name: 'Technologies' })).toBeNull()
    // Et le refus reste sur place : rediriger vers /acces-refuse renverrait un organisateur,
    // qui y est habilité, vers l'accueil — le refus deviendrait une navigation silencieuse.
    expect(router.state.location.pathname).toBe(PATHS.technologies)
  })

  it("n'affiche aucune section tant que les habilitations ne sont pas connues", () => {
    // La session ne se résout jamais : `RequireSession` puis `RequireAccess` rendent `null`,
    // donc la coquille n'est pas montée du tout — plus fort que masquer des sections.
    window.localStorage.setItem('lehub.auth.refreshToken', 'rt')
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => undefined)))

    renderAt('/')

    expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).toBeNull()
    expect(screen.queryByText('Administration générale')).toBeNull()
  })
})

describe('la barre reste pilotable hors de la section communauté', () => {
  it("garde ses entrées communauté sur un écran d'administration générale", async () => {
    // Le défaut constaté : la barre dérivait uniquement de l'URL, or /technologies ne porte
    // aucune communauté. La section disparaissait, et il ne restait aucun chemin de retour.
    await enter(GLOBAL_ADMIN, PATHS.technologies)
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })

    const events = await within(nav).findByRole('link', { name: 'Évènements' })
    expect(events.getAttribute('href')).toBe(`/c/${FIRST.id}/evenements`)
    expect(within(nav).getByRole('link', { name: 'Organisateurs' })).toBeTruthy()
  })

  it("fait repointer la barre quand on y choisit une communauté, sans quitter l'écran", async () => {
    const { router } = await enter(GLOBAL_ADMIN, PATHS.technologies)
    const menu = await openPicker()

    fireEvent.click(within(menu).getByRole('menuitemradio', { name: SECOND.name }))

    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: 'Évènements' }).getAttribute('href')).toBe(
        `/c/${SECOND.id}/evenements`,
      ),
    )
    // « Ne pilote rien » vise le contenu de l'écran, pas la barre : on reste sur les technologies.
    expect(router.state.location.pathname).toBe(PATHS.technologies)
  })

  it("ramène l'URL à la casse canonique de la communauté", async () => {
    // SQL Server rend ses identifiants en majuscules ; un lien recopié peut porter n'importe
    // quelle casse, et tout ce qui compare des chemins s'y perdait — le marquage de l'entrée
    // courante le premier.
    const { router } = await enter(GLOBAL_ADMIN, `/c/${FIRST.id.toLowerCase()}/organisateurs`)

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/c/${FIRST.id}/organisateurs`),
    )
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })
    expect(
      within(nav).getByRole('link', { name: 'Organisateurs' }).getAttribute('aria-current'),
    ).toBe('page')
  })
})

describe('compte à la fois administrateur et organisateur', () => {
  it('voit les deux sections coexister, et toutes les communautés au sélecteur', async () => {
    await enter(ADMIN_AND_ORGANIZER)
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })

    await waitFor(() => expect(within(nav).getByRole('link', { name: 'Évènements' })).toBeTruthy())
    expect(within(nav).getByRole('link', { name: 'Technologies' })).toBeTruthy()

    // Administrateur : le sélecteur propose tout le référentiel, pas seulement ce qu'il organise.
    const menu = await openPicker()
    for (const community of COMMUNITIES) {
      expect(within(menu).getByRole('menuitemradio', { name: community.name })).toBeTruthy()
    }
  })
})

describe('autres constats de la revue', () => {
  it('ramène à la communauté précédente par le retour arrière', async () => {
    const { router } = await enter(GLOBAL_ADMIN, `/c/${FIRST.id}/evenements`)
    const menu = await openPicker()

    fireEvent.click(within(menu).getByRole('menuitemradio', { name: SECOND.name }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/c/${SECOND.id}/evenements`))

    // Empilé et non remplacé : basculer pour jeter un œil doit se défaire par le retour arrière.
    await router.navigate(-1)
    await waitFor(() => expect(router.state.location.pathname).toBe(`/c/${FIRST.id}/evenements`))
  })

  it("propose de réessayer quand la liste n'a pas pu être chargée, et le fait vraiment", async () => {
    window.localStorage.setItem('lehub.auth.refreshToken', 'rt')
    let attempt = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/auth/token')) {
          return Promise.resolve(jsonResponse({ access_token: 'at', refresh_token: 'rt2', expires_in: 3600 }))
        }
        if (url.includes('/api/communities')) {
          attempt += 1
          // Le premier appel échoue, le second réussit : c'est ce que la notice promet.
          return attempt === 1
            ? Promise.reject(new TypeError('network'))
            : Promise.resolve(jsonResponse(COMMUNITIES))
        }
        return Promise.resolve(jsonResponse(openedSession(GLOBAL_ADMIN)))
      }),
    )

    const { router } = renderAt('/')
    const retry = await screen.findByRole('button', { name: /réessayer/i })

    fireEvent.click(retry)

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/c/${FIRST.id}/evenements`),
    )
  })
})

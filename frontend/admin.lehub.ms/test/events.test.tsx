import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionPermissions } from '@lehub/shared/auth/AuthContext'
import { communityPath } from '@/lib/navigation'
import { renderAt } from './support/render-route'
import { ADMIN_AND_ORGANIZER, COMMUNITIES, GLOBAL_ADMIN, ORGANIZER } from './support/session-fixtures'
import { jsonResponse, stubSignedIn } from './support/stub-session'

const AZUG = COMMUNITIES[0]!
const PPF = COMMUNITIES[1]!

const AZUG_EVENTS = communityPath(AZUG.slug, 'evenements')
const PPF_EVENTS = communityPath(PPF.slug, 'evenements')

/**
 * On attend la **table**, pas seulement la coquille : celle-ci se monte avant que la liste ne
 * soit résolue, et asserter trop tôt est ce qui rendait les suites instables (2db4ae7).
 */
async function enter(permissions: SessionPermissions, path: string): Promise<HTMLElement> {
  stubSignedIn(permissions)
  renderAt(path)
  return screen.findByRole('table')
}

/** Les titres de la première colonne, dans l'ordre rendu. Les lignes pleine largeur — état
    vide, ligne de groupe — n'ont qu'une cellule et ne sont pas des évènements. */
function titles(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('cell').length > 1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '')
}

function headerButton(table: HTMLElement, name: string): HTMLElement {
  const header = within(table).getByRole('columnheader', { name: new RegExp(name) })
  return within(header).getByRole('button')
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('liste des évènements', () => {
  it('ne montre que les évènements de la communauté sélectionnée', async () => {
    const table = await enter(ORGANIZER, AZUG_EVENTS)

    const rendered = titles(table)
    expect(rendered).toHaveLength(3)
    expect(rendered.join(' ')).toContain('Azure Deep Dive')
    // Rattaché à la seule autre communauté : il n'a rien à faire ici.
    expect(rendered.join(' ')).not.toContain('Power Platform Apéro')
  })

  it("n'affiche qu'une fois un évènement co-organisé, sans le distinguer", async () => {
    const table = await enter(ORGANIZER, AZUG_EVENTS)

    const shared = titles(table).filter((title) => title.includes('Soirée commune'))
    expect(shared).toHaveLength(1)
    // Rien ne le signale comme partagé : la story demande qu'il soit indiscernable d'un
    // évènement propre à la communauté.
    expect(within(table).queryByText(/co-organis/i)).toBeNull()
  })

  it('recharge la liste quand on change de communauté', async () => {
    // Un administrateur global voit et pilote les deux communautés, donc les deux adresses
    // sont atteignables dans la même suite.
    const first = await enter(GLOBAL_ADMIN, AZUG_EVENTS)
    expect(titles(first).join(' ')).not.toContain('Power Platform Apéro')

    // Démonté explicitement : sans cela les deux applications coexistent dans le document
    // et les requêtes lisent la première.
    cleanup()
    vi.unstubAllGlobals()
    stubSignedIn(GLOBAL_ADMIN)
    renderAt(PPF_EVENTS)

    const rows = await screen.findAllByRole('row')
    const second = rows.map((row) => row.textContent ?? '').join(' ')
    expect(second).toContain('Power Platform Apéro')
    expect(second).not.toContain('Azure Deep Dive')
  })

  it('trie par date de début croissante par défaut', async () => {
    const table = await enter(ORGANIZER, AZUG_EVENTS)

    // Rétrospective (juin) < Azure Deep Dive (septembre) < Soirée commune (octobre).
    expect(titles(table).map((title) => title.slice(0, 12))).toEqual([
      'Rétrospectiv',
      'Azure Deep D',
      'Soirée commu',
    ])
  })

  it('inverse le sens au second clic et annonce le tri', async () => {
    const table = await enter(ORGANIZER, AZUG_EVENTS)

    const start = within(table).getByRole('columnheader', { name: /Début/ })
    expect(start.getAttribute('aria-sort')).toBe('ascending')

    fireEvent.click(headerButton(table, 'Début'))
    expect(start.getAttribute('aria-sort')).toBe('descending')
    expect(titles(table)[0]).toContain('Soirée commune')
  })

  it('trie les dates dans l’ordre du temps, et non dans celui des libellés', async () => {
    // « 11 juin 2026 » précède « 10 sept. 2026 » dans le temps mais le suit alphabétiquement :
    // c'est ce que le tri sur l'horodatage, et non sur la chaîne rendue, garantit.
    const table = await enter(ORGANIZER, AZUG_EVENTS)

    fireEvent.click(headerButton(table, 'Fin'))
    expect(titles(table)[0]).toContain('Rétrospective')
  })

  it('cherche dans le titre et dans la description, et se vide d’un geste', async () => {
    const table = await enter(ORGANIZER, AZUG_EVENTS)
    const search = screen.getByRole('searchbox', { name: /Rechercher un évènement/ })

    fireEvent.change(search, { target: { value: 'deep dive' } })
    expect(titles(table)).toHaveLength(1)

    // Sur la description seule, et sans accent ni casse : « segmentation » n'est que là.
    fireEvent.change(search, { target: { value: 'SEGMENTATION' } })
    expect(titles(table)).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }))
    expect(titles(screen.getByRole('table'))).toHaveLength(3)
  })

  it('annonce le nombre d’évènements affichés, accordé au nombre', async () => {
    await enter(ORGANIZER, AZUG_EVENTS)

    const count = screen.getByRole('status')
    expect(count.textContent).toBe('3 évènements')

    fireEvent.change(screen.getByRole('searchbox', { name: /Rechercher/ }), {
      target: { value: 'deep dive' },
    })
    expect(screen.getByRole('status').textContent).toBe('1 évènement')
  })

  it('mène au formulaire depuis le titre comme depuis l’action de ligne', async () => {
    const table = await enter(ORGANIZER, AZUG_EVENTS)

    const row = within(table)
      .getAllByRole('row')
      .find((candidate) => candidate.textContent?.includes('Azure Deep Dive'))!
    const expected = `${AZUG_EVENTS}/E1E1E1E1-0000-0000-0000-000000000001`

    // Le nom exact, et non un motif : l'action de ligne s'appelle « Modifier <titre> » et un
    // motif large attraperait les deux liens sans distinguer lequel est lequel.
    expect(
      within(row).getByRole('link', { name: 'Azure Deep Dive : réseau et sécurité' }).getAttribute('href'),
    ).toBe(expected)
    expect(
      within(row).getByRole('link', { name: 'Modifier Azure Deep Dive : réseau et sécurité' }).getAttribute('href'),
    ).toBe(expected)
  })

  it('affiche un repli plutôt qu’une image cassée quand la bannière manque', async () => {
    const table = await enter(ORGANIZER, AZUG_EVENTS)

    // Une seule des trois lignes porte une bannière : les deux autres n'ont donc pas d'image
    // du tout, plutôt qu'une balise pointant dans le vide.
    const images = within(table).getAllByRole('presentation', { hidden: true })
    expect(images.filter((image) => image.tagName === 'IMG')).toHaveLength(1)
  })

  it('affiche les dates en français, dans le fuseau Europe/Paris', async () => {
    const table = await enter(ORGANIZER, AZUG_EVENTS)

    const row = within(table)
      .getAllByRole('row')
      .find((candidate) => candidate.textContent?.includes('Azure Deep Dive'))!

    // 16:30 UTC un 10 septembre, c'est 18:30 à Paris — deux heures d'écart en heure d'été.
    // Sans `timeZone` explicite, ces assertions suivraient le fuseau de la machine de test.
    // Début et fin tombent le même jour, d'où deux fois la même date et deux heures distinctes.
    expect(within(row).getAllByText('10 sept. 2026')).toHaveLength(2)
    expect(within(row).getByText('jeudi · 18:30')).toBeTruthy()
    expect(within(row).getByText('jeudi · 21:00')).toBeTruthy()
  })
})

describe('états vides', () => {
  it('invite à créer un évènement quand la communauté n’en a aucun', async () => {
    stubSignedIn(GLOBAL_ADMIN, { '/api/manage/events': () => jsonResponse([]) })
    renderAt(AZUG_EVENTS)

    expect(await screen.findByText('Aucun évènement pour cette communauté')).toBeTruthy()
    // Des liens et non des boutons : l'action navigue vers une autre adresse. Il y en a deux,
    // celui de l'en-tête et celui de l'état vide, et ils mènent au même endroit — c'est la même
    // duplication assumée que sur les écrans de référentiel.
    const actions = screen.getAllByRole('link', { name: 'Nouvel évènement' })
    expect(actions).toHaveLength(2)
    for (const action of actions) {
      expect(action.getAttribute('href')).toBe(`${AZUG_EVENTS}/nouveau`)
    }
    // Pas de table du tout : ni recherche ni décompte n'ont de sens sur une liste vide.
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('distingue « aucun résultat » de « aucun évènement »', async () => {
    await enter(ORGANIZER, AZUG_EVENTS)

    fireEvent.change(screen.getByRole('searchbox', { name: /Rechercher/ }), {
      target: { value: 'quantique' },
    })

    expect(screen.getByText('Aucun résultat pour « quantique »')).toBeTruthy()
    expect(screen.queryByText('Aucun évènement pour cette communauté')).toBeNull()

    // La sortie proposée efface la recherche plutôt que de mener ailleurs.
    fireEvent.click(screen.getByRole('button', { name: 'Afficher tous les évènements' }))
    expect(await screen.findByRole('table')).toBeTruthy()
  })

  it('propose de réessayer quand la lecture échoue', async () => {
    stubSignedIn(ADMIN_AND_ORGANIZER, {
      '/api/manage/events': (attempt) =>
        attempt === 1 ? jsonResponse({ code: 'BOOM' }, 500) : jsonResponse([]),
    })
    renderAt(AZUG_EVENTS)

    fireEvent.click(await screen.findByRole('button', { name: /Réessayer/ }))
    expect(await screen.findByText('Aucun évènement pour cette communauté')).toBeTruthy()
  })
})

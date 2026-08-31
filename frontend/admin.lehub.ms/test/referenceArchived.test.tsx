import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PATHS } from '@/lib/navigation'
import { renderAt } from './support/render-route'
import { ADMIN_COMMUNITIES, GLOBAL_ADMIN } from './support/session-fixtures'
import { jsonResponse, stubSignedIn, type FetchOverrides } from './support/stub-session'

const ARCHIVED_COMMUNITY = ADMIN_COMMUNITIES[2]!
const ACTIVE_COMMUNITIES = ADMIN_COMMUNITIES.filter((entry) => entry.status === 'active')

async function enter(
  path: string,
  overrides: FetchOverrides = {},
): Promise<{ table: HTMLElement; unmount: () => void }> {
  stubSignedIn(GLOBAL_ADMIN, overrides)
  const { unmount } = renderAt(path)
  return { table: await screen.findByRole('table'), unmount }
}

/** La cellule du nom porte aussi les initiales et la description : on cherche dedans. */
function lists(table: HTMLElement, name: string): boolean {
  return names(table).some((cell) => cell.includes(name))
}

/** Le contrôle de repli, quel que soit le référentiel et le nombre qu'il annonce. */
function groupToggle(): HTMLElement {
  return screen.getByRole('button', { name: /archivée/ })
}

/** Les entrées rendues, dans l'ordre : les lignes à une seule cellule n'en sont pas. */
function names(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('cell').length > 1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '')
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('repli des entrées archivées', () => {
  // Le critère « le comportement est identique sur les deux référentiels » se vérifie en le
  // jouant sur les deux, pas en le supposant du composant partagé.
  for (const [label, path, archivedLabel] of [
    ['communautés', PATHS.communities, '1 communauté archivée'],
    ['technologies', PATHS.technologies, '2 technologies archivées'],
  ] as const) {
    it(`replie les archivées par défaut sur les ${label}`, async () => {
      const { table } = await enter(path)

      const toggle = within(table).getByRole('button', { name: archivedLabel })
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
      expect(within(table).queryByText('Archivée')).toBeNull()
    })
  }

  it('déplie d’un clic et replie d’un second', async () => {
    const { table } = await enter(PATHS.communities)

    fireEvent.click(groupToggle())
    expect(groupToggle().getAttribute('aria-expanded')).toBe('true')
    expect(lists(table, ARCHIVED_COMMUNITY.name)).toBe(true)
    expect(within(table).getByText('Archivée')).not.toBeNull()

    fireEvent.click(groupToggle())
    expect(groupToggle().getAttribute('aria-expanded')).toBe('false')
    expect(names(table)).toHaveLength(ACTIVE_COMMUNITIES.length)
  })

  it('n’offre aucune ligne de groupe quand rien n’est archivé', async () => {
    const { table } = await enter(PATHS.communities, {
      '/api/manage/communities': () => jsonResponse(ACTIVE_COMMUNITIES),
    })

    expect(within(table).queryByRole('button', { name: /archivée/ })).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('2 communautés actives')
  })
})

describe('tri et repli', () => {
  it('trie l’ensemble des entrées, groupe déplié compris, sans déplacer la ligne de groupe', async () => {
    // Sur les technologies : deux actives et deux archivées, le seul jeu où un tri par groupe se
    // distingue d'un tri global.
    const { table } = await enter(PATHS.technologies)
    fireEvent.click(groupToggle())

    const ascending = names(table)
    const positionOf = () =>
      within(table)
        .getAllByRole('row')
        .findIndex((row) => within(row).queryAllByRole('cell').length === 1)
    const groupPosition = positionOf()

    fireEvent.click(
      within(within(table).getByRole('columnheader', { name: /Technologie/ })).getByRole('button'),
    )

    // Les deux moitiés se retournent, chacune chez elle : le tri est global, mais la partition
    // reste devant lui.
    const descending = names(table)
    expect(descending.slice(0, 2)).toEqual(ascending.slice(0, 2).reverse())
    expect(descending.slice(2)).toEqual(ascending.slice(2).reverse())
    // Et la ligne de groupe n'a pas bougé d'un cran.
    expect(positionOf()).toBe(groupPosition)
  })
})

describe('recherche et repli', () => {
  it('déplie le groupe sans qu’on l’ait demandé, et le replie quand la recherche est effacée', async () => {
    const { table } = await enter(PATHS.communities)
    expect(groupToggle().getAttribute('aria-expanded')).toBe('false')

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'generaliste' } })
    expect(groupToggle().getAttribute('aria-expanded')).toBe('true')
    expect(names(table)).toEqual([expect.stringContaining(ARCHIVED_COMMUNITY.name)])
    // Le cas « les deux à la fois » : aucune active ne correspond, et le groupe est ouvert.
    expect(within(table).getByText(/Aucune entrée active/)).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }))
    // Retour à la préférence, pas au dernier état de la recherche.
    expect(groupToggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('laisse replier pendant une recherche, sans retenir ce repli', async () => {
    await enter(PATHS.communities)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'generaliste' } })
    fireEvent.click(groupToggle())
    expect(groupToggle().getAttribute('aria-expanded')).toBe('false')

    // La frappe suivante rouvre : le repli pendant une recherche est éphémère, et surtout il
    // n'a pas touché la préférence.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'generalist' } })
    expect(groupToggle().getAttribute('aria-expanded')).toBe('true')
    expect(window.localStorage.getItem('lehub.admin.archivedExpanded.communities')).toBeNull()
  })
})

describe('persistance du repli', () => {
  it('retrouve l’état déplié à la visite suivante', async () => {
    const first = await enter(PATHS.communities)
    fireEvent.click(within(first.table).getByRole('button', { name: /archivée/ }))

    // Démonté avant de remonter : deux arbres React dans le même document, et `getByRole`
    // trouverait la table de la première visite.
    first.unmount()
    vi.unstubAllGlobals()
    const { table } = await enter(PATHS.communities)

    // Déplié dès l'arrivée, sans un clic.
    expect(within(table).getByRole('button', { name: /archivée/ }).getAttribute('aria-expanded')).toBe(
      'true',
    )
  })

  it('retient les deux référentiels séparément', async () => {
    const first = await enter(PATHS.communities)
    fireEvent.click(within(first.table).getByRole('button', { name: /archivée/ }))

    first.unmount()
    vi.unstubAllGlobals()
    const { table } = await enter(PATHS.technologies)

    expect(within(table).getByRole('button', { name: /archivée/ }).getAttribute('aria-expanded')).toBe(
      'false',
    )
  })

  it('s’affiche replié quand le stockage local est illisible', async () => {
    // Seule la clé de repli lève ; le reste du stockage continue de fonctionner, sans quoi
    // `stubSignedIn` ne restaurerait même pas la session et le test ne prouverait rien. Le
    // stockage est remplacé par une Map plutôt que délégué à l'original — détacher une méthode
    // du prototype pour la rappeler ensuite est précisément ce que `unbound-method` interdit.
    const store = new Map<string, string>()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
      store.set(key, value)
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key.startsWith('lehub.admin.archivedExpanded')) throw new Error('stockage refusé')
      return store.get(key) ?? null
    })

    const { table } = await enter(PATHS.communities)

    expect(within(table).getByRole('button', { name: /archivée/ }).getAttribute('aria-expanded')).toBe(
      'false',
    )
  })
})

describe('états vides et décompte', () => {
  it('occupe la place des actives quand tout est archivé, et garde la ligne de groupe', async () => {
    const { table } = await enter(PATHS.communities, {
      '/api/manage/communities': () => jsonResponse([ARCHIVED_COMMUNITY]),
    })

    expect(within(table).getByText('Aucune entrée active.')).not.toBeNull()
    expect(within(table).getByRole('button', { name: '1 communauté archivée' })).not.toBeNull()
    expect(screen.getByRole('status').textContent).toBe('0 communauté active · 1 archivée')
  })

  it('accorde le décompte au singulier comme au pluriel', async () => {
    await enter(PATHS.technologies)

    expect(screen.getByRole('status').textContent).toBe('2 technologies actives · 2 archivées')
  })

  it('n’affiche aucune ligne de groupe quand la recherche ne trouve rien nulle part', async () => {
    await enter(PATHS.communities)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzz' } })

    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('button', { name: /archivée/ })).toBeNull()
    expect(screen.getByText(/Aucun résultat pour/)).not.toBeNull()
  })
})

describe('réactivation depuis le groupe', () => {
  it('fait remonter l’entrée dans le groupe actif et met les compteurs à jour', async () => {
    let listed = 0
    const { table } = await enter(PATHS.communities, {
      '/api/manage/communities': () => {
        listed += 1
        // Après l'enregistrement, le serveur ne la rend plus archivée.
        return jsonResponse(
          listed === 1
            ? ADMIN_COMMUNITIES
            : ADMIN_COMMUNITIES.map((entry) =>
                entry.id === ARCHIVED_COMMUNITY.id ? { ...entry, status: 'active' } : entry,
              ),
        )
      },
    })

    fireEvent.click(groupToggle())
    fireEvent.click(screen.getByRole('button', { name: `Modifier ${ARCHIVED_COMMUNITY.name}` }))
    const panel = screen.getByRole('dialog')
    fireEvent.click(
      within(within(panel).getByRole('radiogroup', { name: 'Statut' })).getByRole('radio', {
        name: 'Active',
      }),
    )
    fireEvent.click(within(panel).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('3 communautés actives')
    })
    expect(lists(table, ARCHIVED_COMMUNITY.name)).toBe(true)
    expect(screen.queryByRole('button', { name: /archivée/ })).toBeNull()
  })
})

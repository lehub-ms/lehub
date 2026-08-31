import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PATHS } from '@/lib/navigation'
import { renderAt } from './support/render-route'
import {
  ADMIN_COMMUNITIES,
  ADMIN_TECHNOLOGIES,
  GLOBAL_ADMIN,
  ORGANIZER,
} from './support/session-fixtures'

/** Les technologies que la table rend sans rien déplier. */
const ACTIVE_TECHNOLOGIES = ADMIN_TECHNOLOGIES.filter((t) => t.status === 'active').length
import { jsonResponse, stubSignedIn } from './support/stub-session'
import type { SessionPermissions } from '@lehub/shared/auth/AuthContext'

/**
 * On attend la **table**, pas seulement la navigation : la coquille se monte avant que la liste
 * du référentiel ne soit résolue, et asserter trop tôt est précisément ce qui rendait les suites
 * de la coquille instables (corrigé en 2db4ae7).
 */
async function enter(permissions: SessionPermissions, path: string): Promise<HTMLElement> {
  stubSignedIn(permissions)
  renderAt(path)
  return screen.findByRole('table')
}

function columnHeader(table: HTMLElement, name: string): HTMLElement {
  return within(table).getByRole('columnheader', { name: new RegExp(name) })
}

/**
 * Cadré sur l'en-tête, jamais sur la table : les actions de ligne portent le nom de leur entrée
 * (« Modifier Communauté Généraliste… »), et un motif large les attraperait aussi.
 */
function headerButton(table: HTMLElement, name: string): HTMLElement {
  return within(columnHeader(table, name)).getByRole('button')
}

/**
 * Les libellés de la première colonne, dans l'ordre où la table les rend.
 *
 * Les lignes à une seule cellule sont écartées : la ligne de groupe et la ligne « aucune entrée
 * active » couvrent toute la largeur par `colSpan` et ne sont pas des entrées. Un filtre sur le
 * nombre de cellules plutôt qu'un attribut de test posé dans le rendu de production.
 */
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

describe('référentiel des communautés', () => {
  it('replie les entrées archivées derrière une ligne de groupe', async () => {
    const table = await enter(GLOBAL_ADMIN, PATHS.communities)

    // Les actives seules sont rendues ; l'archivée est derrière un compteur, d'où on la déplie.
    expect(names(table)).toHaveLength(2)
    expect(within(table).getAllByText('Active')).toHaveLength(2)
    expect(within(table).queryByText('Archivée')).toBeNull()

    const group = within(table).getByRole('button', { name: '1 communauté archivée' })
    expect(group.getAttribute('aria-expanded')).toBe('false')
  })

  it('annonce le nombre d’entrées, accordé au singulier comme au pluriel', async () => {
    await enter(GLOBAL_ADMIN, PATHS.communities)

    // `role="status"` : la valeur change à chaque frappe, et c'est là qu'elle doit être annoncée.
    // Les deux populations séparément : un total ne correspondrait à aucune des listes visibles.
    expect(screen.getByRole('status').textContent).toBe('2 communautés actives · 1 archivée')

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Azure' } })
    // Aucune archivée ne correspond : la part archivée disparaît plutôt que d'annoncer zéro.
    expect(screen.getByRole('status').textContent).toBe('1 communauté active')
  })

  it('trie par colonne et inverse le sens au second clic, en l’annonçant', async () => {
    const table = await enter(GLOBAL_ADMIN, PATHS.communities)

    // Tri par défaut : le nom, croissant.
    expect(columnHeader(table, 'Communauté').getAttribute('aria-sort')).toBe('ascending')
    const ascending = names(table)

    fireEvent.click(headerButton(table, 'Communauté'))
    expect(columnHeader(table, 'Communauté').getAttribute('aria-sort')).toBe('descending')
    expect(names(table)).toEqual([...ascending].reverse())
  })

  it('trie les organisateurs en nombre, pas en texte', async () => {
    const table = await enter(GLOBAL_ADMIN, PATHS.communities)

    fireEvent.click(headerButton(table, 'Organisateurs'))

    // 0, 1, 2 — un tri alphabétique rangerait « 10 » avant « 2 » ; ici la fixture suffit à
    // prouver que c'est bien la valeur numérique qui ordonne.
    expect(columnHeader(table, 'Organisateurs').getAttribute('aria-sort')).toBe('ascending')
    expect(names(table)[0]).toContain('Power Platform France')
  })

  it('n’annonce aucun tri sur une colonne qui n’en a pas', async () => {
    const table = await enter(GLOBAL_ADMIN, PATHS.communities)

    // Le nom et le compteur d'organisateurs sont triables ; le statut ne l'est plus depuis
    // #173 — la partition l'ordonne déjà — et la colonne d'actions ne porte pas d'en-tête nommé.
    for (const header of within(table).getAllByRole('columnheader')) {
      const sortable = within(header).queryByRole('button') !== null
      expect(header.getAttribute('aria-sort') === null).toBe(!sortable)
    }
  })

  it('cherche sur le nom et sur la description, et se vide d’un geste', async () => {
    const table = await enter(GLOBAL_ADMIN, PATHS.communities)
    const search = screen.getByRole('searchbox')

    fireEvent.change(search, { target: { value: 'low-code' } })
    expect(names(table)).toHaveLength(1)
    expect(names(table)[0]).toContain('Power Platform France')

    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }))
    // Deux, pas trois : le groupe archivé s'est replié en même temps que la recherche.
    expect(names(table)).toHaveLength(2)
  })

  it('trouve un nom accentué sans qu’on ait à taper l’accent', async () => {
    const table = await enter(GLOBAL_ADMIN, PATHS.communities)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'generaliste' } })

    // La seule correspondance est archivée : la recherche a donc déplié le groupe d'elle-même,
    // sans quoi elle ne rendrait rien du tout.
    expect(names(table)).toHaveLength(1)
    expect(
      within(table).getByRole('button', { name: /archivée/ }).getAttribute('aria-expanded'),
    ).toBe('true')
  })

  it('distingue une recherche sans résultat d’un référentiel vide', async () => {
    await enter(GLOBAL_ADMIN, PATHS.communities)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzz' } })

    expect(screen.getByText(/Aucun résultat pour/)).not.toBeNull()
    expect(screen.queryByText('Aucune communauté référencée')).toBeNull()
    // La sortie est offerte, elle porte un nom distinct de celui du champ, et elle fonctionne.
    fireEvent.click(screen.getByRole('button', { name: 'Afficher toutes les communautés' }))
    expect(await screen.findByRole('table')).not.toBeNull()
  })

  it('invite à créer la première entrée quand le référentiel est vide', async () => {
    stubSignedIn(GLOBAL_ADMIN, { '/api/manage/communities': () => jsonResponse([]) })
    renderAt(PATHS.communities)

    expect(await screen.findByText('Aucune communauté référencée')).not.toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('propose de réessayer quand la liste n’a pas pu être chargée', async () => {
    stubSignedIn(GLOBAL_ADMIN, {
      '/api/manage/communities': (attempt) =>
        attempt === 1 ? jsonResponse({ code: 'BOOM' }, 500) : jsonResponse(ADMIN_COMMUNITIES),
    })
    renderAt(PATHS.communities)

    fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }))

    // Et le réessai charge vraiment : l'écran d'erreur ne se contente pas d'un bouton décoratif.
    expect(await screen.findByRole('table')).not.toBeNull()
  })
})

describe('référentiel des technologies', () => {
  it('liste ses entrées sans colonne d’organisateurs ni description', async () => {
    const table = await enter(GLOBAL_ADMIN, PATHS.technologies)

    expect(names(table)).toHaveLength(ACTIVE_TECHNOLOGIES)
    expect(within(table).queryByRole('columnheader', { name: /Organisateurs/ })).toBeNull()
  })

  it('ne cherche que sur le nom', async () => {
    const table = await enter(GLOBAL_ADMIN, PATHS.technologies)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Azure' } })

    expect(names(table)).toHaveLength(1)
  })

  it('affiche les initiales d’une technologie sans icône', async () => {
    const table = await enter(GLOBAL_ADMIN, PATHS.technologies)

    // « .NET » : la ponctuation ne compte pas comme une initiale.
    expect(within(table).getByText('N')).not.toBeNull()
  })
})

describe('habilitation des écrans de référentiel', () => {
  for (const path of [PATHS.communities, PATHS.technologies]) {
    it(`refuse ${path} à un organisateur, sans rien en divulguer`, async () => {
      stubSignedIn(ORGANIZER)
      renderAt(path)

      expect(
        await screen.findByRole('heading', { name: /Section réservée aux administrateurs/ }),
      ).not.toBeNull()
      // Ni la table, ni même la barre de recherche : l'écran n'est pas monté du tout.
      expect(screen.queryByRole('table')).toBeNull()
      expect(screen.queryByRole('searchbox')).toBeNull()
    })
  }
})

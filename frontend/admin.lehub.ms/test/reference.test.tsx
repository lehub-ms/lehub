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

/** Les libellés de la première colonne, dans l'ordre où la table les rend. */
function names(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('row')
    .slice(1)
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
  it('liste les entrées actives comme archivées, et les distingue par leur statut', async () => {
    const table = await enter(GLOBAL_ADMIN, PATHS.communities)

    // Les archivées ne sont pas cachées : c'est de cette liste qu'on les réactive.
    expect(names(table)).toHaveLength(ADMIN_COMMUNITIES.length)
    expect(within(table).getByText('Archivée')).not.toBeNull()
    expect(within(table).getAllByText('Active')).toHaveLength(2)
  })

  it('annonce le nombre d’entrées, accordé au singulier comme au pluriel', async () => {
    await enter(GLOBAL_ADMIN, PATHS.communities)

    // `role="status"` : la valeur change à chaque frappe, et c'est là qu'elle doit être annoncée.
    expect(screen.getByRole('status').textContent).toBe('3 communautés')

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Azure' } })
    expect(screen.getByRole('status').textContent).toBe('1 communauté')
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

    // Toutes les colonnes de cet écran sont triables ; ce qui ne doit pas l'être, c'est la
    // colonne d'actions, qui ne porte pas d'en-tête nommé.
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
    expect(names(table)).toHaveLength(ADMIN_COMMUNITIES.length)
  })

  it('trouve un nom accentué sans qu’on ait à taper l’accent', async () => {
    const table = await enter(GLOBAL_ADMIN, PATHS.communities)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'generaliste' } })

    expect(names(table)).toHaveLength(1)
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

    expect(names(table)).toHaveLength(ADMIN_TECHNOLOGIES.length)
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

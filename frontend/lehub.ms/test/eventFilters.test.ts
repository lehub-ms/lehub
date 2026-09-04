import { describe, expect, it } from 'vitest'
import {
  activeFilterCount,
  applyEventFilters,
  deriveFilterOptions,
  diffFilterSelection,
  EMPTY_FILTER_SELECTION,
  sameFilterSelection,
  summarizeSelection,
} from '@/lib/eventFilters'
import { buildEvent, buildNamedRef } from './support/event-fixtures'

const communityA = buildNamedRef('community', 1)
const communityB = buildNamedRef('community', 2)
const techX = buildNamedRef('technology', 1)
const techY = buildNamedRef('technology', 2)

describe('deriveFilterOptions', () => {
  it('dedupes communities and technologies by id across events', () => {
    const events = [
      buildEvent({ id: 'e1', communities: [communityA], technologies: [techX] }),
      buildEvent({ id: 'e2', communities: [communityA, communityB], technologies: [techX, techY] }),
    ]

    const options = deriveFilterOptions(events)

    expect(options.communities).toEqual([communityA, communityB])
    expect(options.technologies).toEqual([techX, techY])
  })

  it('carries each ref\u2019s logo through to the option, instead of dropping it', () => {
    const withLogo = buildNamedRef('community', 9, 'https://media.example/communities/nine.svg')
    const options = deriveFilterOptions([buildEvent({ communities: [withLogo] })])
    expect(options.communities[0]?.logoUrl).toBe(withLogo.logoUrl)
  })

  it('computes options from the full set, independent of any filter applied elsewhere', () => {
    const events = [
      buildEvent({ id: 'e1', communities: [communityA], technologies: [techX] }),
      buildEvent({ id: 'e2', communities: [communityB], technologies: [techY] }),
    ]

    // Filtering on technology X leaves only e1 visible...
    const visible = applyEventFilters(events, { communityIds: [], technologyIds: [techX.id] })
    expect(visible.some((event) => event.communities.some((c) => c.id === communityB.id))).toBe(false)

    // ...but community B must still be a listed option, computed from the full `events`
    // array, not from `visible`.
    const options = deriveFilterOptions(events)
    expect(options.communities).toContainEqual(communityB)
  })
})

describe('applyEventFilters', () => {
  it('excludes nothing when the selection is empty', () => {
    const events = [buildEvent({ id: 'e1' }), buildEvent({ id: 'e2' })]
    expect(applyEventFilters(events, EMPTY_FILTER_SELECTION)).toHaveLength(2)
  })

  it('applies OR within the community dimension', () => {
    const events = [
      buildEvent({ id: 'e1', communities: [communityA] }),
      buildEvent({ id: 'e2', communities: [communityB] }),
      buildEvent({ id: 'e3', communities: [buildNamedRef('community', 3)] }),
    ]

    const visible = applyEventFilters(events, {
      communityIds: [communityA.id, communityB.id],
      technologyIds: [],
    })

    expect(visible.map((event) => event.id)).toEqual(['e1', 'e2'])
  })

  it('matches a multi-community event on any selected community', () => {
    const events = [buildEvent({ id: 'e1', communities: [communityA, communityB] })]
    const visible = applyEventFilters(events, { communityIds: [communityB.id], technologyIds: [] })
    expect(visible).toHaveLength(1)
  })

  it('matches a multi-technology event on any selected technology', () => {
    const events = [buildEvent({ id: 'e1', technologies: [techX, techY] })]
    const visible = applyEventFilters(events, { communityIds: [], technologyIds: [techX.id] })
    expect(visible).toHaveLength(1)
  })

  it('applies AND across the community and technology dimensions', () => {
    const events = [
      buildEvent({ id: 'e1', communities: [communityA], technologies: [techX] }),
      buildEvent({ id: 'e2', communities: [communityA], technologies: [techY] }),
      buildEvent({ id: 'e3', communities: [communityB], technologies: [techX] }),
    ]

    const visible = applyEventFilters(events, {
      communityIds: [communityA.id],
      technologyIds: [techX.id],
    })

    expect(visible.map((event) => event.id)).toEqual(['e1'])
  })
})

describe('activeFilterCount', () => {
  it('sums selections across both dimensions', () => {
    expect(
      activeFilterCount({ communityIds: [communityA.id, communityB.id], technologyIds: [techX.id] }),
    ).toBe(3)
  })

  it('is zero for the empty selection', () => {
    expect(activeFilterCount(EMPTY_FILTER_SELECTION)).toBe(0)
  })
})

describe('sameFilterSelection', () => {
  it('ignore l’ordre de cochage', () => {
    // La divergence fantôme que #193 interdit : cocher A puis B, ou B puis A, c'est la même
    // sélection, et la barre doit rester au repos.
    expect(
      sameFilterSelection(
        { communityIds: [communityA.id, communityB.id], technologyIds: [techX.id, techY.id] },
        { communityIds: [communityB.id, communityA.id], technologyIds: [techY.id, techX.id] },
      ),
    ).toBe(true)
  })

  it('ignore les doublons', () => {
    expect(
      sameFilterSelection(
        { communityIds: [communityA.id, communityA.id], technologyIds: [] },
        { communityIds: [communityA.id], technologyIds: [] },
      ),
    ).toBe(true)
  })

  it('voit une vraie différence, dimension par dimension', () => {
    expect(
      sameFilterSelection(
        { communityIds: [communityA.id], technologyIds: [] },
        { communityIds: [communityB.id], technologyIds: [] },
      ),
    ).toBe(false)
    expect(
      sameFilterSelection(
        { communityIds: [], technologyIds: [techX.id] },
        { communityIds: [], technologyIds: [] },
      ),
    ).toBe(false)
  })
})

describe('diffFilterSelection', () => {
  const names = new Map([
    [communityA.id, communityA.name],
    [communityB.id, communityB.name],
    [techX.id, techX.name],
  ])

  it('nomme chaque entrée ajoutée et chaque entrée retirée', () => {
    const diff = diffFilterSelection(
      { communityIds: [communityA.id], technologyIds: [] },
      { communityIds: [communityB.id], technologyIds: [techX.id] },
      names,
    )

    expect(diff.added.map((entry) => entry.name)).toEqual([communityB.name, techX.name])
    expect(diff.removed.map((entry) => entry.name)).toEqual([communityA.name])
  })

  it('porte la dimension de chaque entrée', () => {
    const diff = diffFilterSelection(EMPTY_FILTER_SELECTION, { communityIds: [], technologyIds: [techX.id] }, names)

    expect(diff.added).toEqual([{ id: techX.id, name: techX.name, dimension: 'technology' }])
  })

  it('retombe sur l’identifiant plutôt que de laisser un trou', () => {
    // Une entrée archivée n'est plus proposée au filtrage : sans nom connu, l'écart doit rester
    // affichable — mais c'est le cas dégradé, pas le nominal.
    const diff = diffFilterSelection(
      { communityIds: ['disparue'], technologyIds: [] },
      EMPTY_FILTER_SELECTION,
      names,
    )

    expect(diff.removed[0]?.name).toBe('disparue')
  })

  it('ne voit aucun écart entre deux sélections équivalentes', () => {
    const diff = diffFilterSelection(
      { communityIds: [communityA.id, communityB.id], technologyIds: [] },
      { communityIds: [communityB.id, communityA.id], technologyIds: [] },
      names,
    )

    expect(diff).toEqual({ added: [], removed: [] })
  })
})

describe('summarizeSelection', () => {
  it('résume les deux dimensions, accordées', () => {
    expect(
      summarizeSelection({ communityIds: [communityA.id, communityB.id], technologyIds: [techX.id] }),
    ).toBe('2 communautés · 1 technologie')
  })

  it('n’annonce que la dimension effectivement sélectionnée', () => {
    expect(summarizeSelection({ communityIds: [communityA.id], technologyIds: [] })).toBe(
      '1 communauté',
    )
  })

  it('dit ce que vaut une sélection vide', () => {
    // Enregistrer « tous les évènements » est un choix, pas une absence de choix.
    expect(summarizeSelection(EMPTY_FILTER_SELECTION)).toBe('Tous les évènements — aucun filtre')
  })
})

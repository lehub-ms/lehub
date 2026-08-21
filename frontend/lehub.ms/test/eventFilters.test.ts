import { describe, expect, it } from 'vitest'
import {
  activeFilterCount,
  applyEventFilters,
  deriveFilterOptions,
  EMPTY_FILTER_SELECTION,
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

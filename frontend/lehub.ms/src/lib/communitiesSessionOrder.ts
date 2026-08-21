import type { CommunitySummary } from '@/lib/api'

/**
 * Shuffled once per browser session (i.e. once per load of this JS module), then
 * reused on every mount — including navigating away from and back to the home page —
 * so the carousel order stays stable "for the rest of the session" as Story #15 asks,
 * rather than reshuffling every time the component remounts. A community added or
 * removed after the first shuffle simply won't appear or disappear until a full
 * reload — an edge case rare enough not to warrant reconciling the cached order.
 */
let sessionOrder: string[] | null = null

/**
 * Test-only: clears the cached order so each test case gets its own session instead
 * of inheriting whatever an earlier test's mock data happened to shuffle.
 */
export function resetCommunitiesSessionOrderForTests(): void {
  sessionOrder = null
}

function shuffled(ids: string[]): string[] {
  const result = [...ids]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    // Bounds are provably valid (0 <= j <= i < result.length), so the assertions just
    // work around `noUncheckedIndexedAccess` rather than hiding a real gap.
    const temp = result[i]!
    result[i] = result[j]!
    result[j] = temp
  }
  return result
}

export function orderForSession(communities: CommunitySummary[]): CommunitySummary[] {
  sessionOrder ??= shuffled(communities.map((community) => community.id))

  const byId = new Map(communities.map((community) => [community.id, community]))
  return sessionOrder
    .map((id) => byId.get(id))
    .filter((community): community is CommunitySummary => community !== undefined)
}

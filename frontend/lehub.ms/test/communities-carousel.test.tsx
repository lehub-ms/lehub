import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { renderAt } from './support/render-route'
import { CommunitiesCarousel } from '@/components/CommunitiesCarousel'
import { resetCommunitiesSessionOrderForTests } from '@/lib/communitiesSessionOrder'
import type { CommunitySummary } from '@/lib/api'

const REGION_NAME = /Carrousel des communautés partenaires/

function mockCommunities(prefix: string, count: number): CommunitySummary[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `Communauté ${prefix} ${index}`,
    logoUrl: index === 0 ? null : `https://example.com/${prefix}-${index}.png`,
    description: index === 1 ? null : `Description ${prefix} ${index}`,
  }))
}

function mockCommunity(prefix: string, overrides: Partial<CommunitySummary> = {}): CommunitySummary {
  return {
    id: `${prefix}-0`,
    name: `Communauté ${prefix} 0`,
    logoUrl: `https://example.com/${prefix}-0.png`,
    description: `Description ${prefix} 0`,
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubFetchOk(data: unknown): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(data)))
}

function track(): HTMLElement {
  return screen.getByTestId('communities-track')
}

/**
 * `step()` now ignores a click/key-press while its own 400ms transition is still
 * animating, so a second step needs to wait it out first — otherwise it would be a
 * silent no-op rather than a second card width of movement.
 */
function settleStep(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 450))
}

/** Reads the pixel amount out of `translateX(-Npx)`, 0 when no transform is set yet. */
function transformPx(el: HTMLElement): number {
  const match = /translateX\((-?[\d.]+)px\)/.exec(el.style.transform)
  return match ? Number(match[1]) : 0
}

beforeEach(() => {
  // The shuffled order is cached at module scope for the whole browser session by
  // design (see the comment on `sessionOrder`) — reset it per test so one test's mock
  // ids can't leave a stale order for the next test's, unrelated, mock ids to inherit.
  resetCommunitiesSessionOrderForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('carrousel des communautés — chargement', () => {
  it('affiche un état de chargement avant la réponse de l’API', async () => {
    let resolveFetch: (response: Response) => void = () => undefined
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending))

    render(<CommunitiesCarousel />)
    expect(screen.getByText('Chargement des communautés…')).not.toBeNull()

    resolveFetch(jsonResponse(mockCommunities('chargement', 1)))
    await screen.findByRole('region', { name: REGION_NAME })
  })

  it('affiche un message si l’API échoue, sans casser la page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 500)))

    render(<CommunitiesCarousel />)

    await screen.findByText('Impossible de charger les communautés partenaires pour le moment.')
    expect(screen.queryByRole('region', { name: REGION_NAME })).toBeNull()
  })

  it('affiche une note discrète quand aucune communauté n’est référencée', async () => {
    stubFetchOk([])

    render(<CommunitiesCarousel />)

    await screen.findByText('Aucune communauté partenaire à afficher pour le moment.')
    expect(screen.queryByRole('region', { name: REGION_NAME })).toBeNull()
  })
})

describe('carrousel des communautés — intégration dans la page d’accueil', () => {
  it('remplace le placeholder par le composant carrousel', async () => {
    // Uses the default `[]` fetch stub from test/setup.ts — this is a wiring check,
    // not a behavior test, so the exact response doesn't matter.
    renderAt('/')

    await screen.findByText('Aucune communauté partenaire à afficher pour le moment.')
    expect(screen.queryByText('Les communautés partenaires s’afficheront ici très bientôt.')).toBeNull()
  })
})

describe('carrousel des communautés — contenu des cartes', () => {
  it('affiche le logo, le nom et la description de chaque communauté', async () => {
    const community = mockCommunity('contenu')
    stubFetchOk([community])

    render(<CommunitiesCarousel />)
    const region = await screen.findByRole('region', { name: REGION_NAME })

    expect(within(region).getByRole('heading', { level: 3, name: community.name })).not.toBeNull()
    expect(within(region).getByText(community.description ?? '')).not.toBeNull()
    const logo = within(region).getByRole('img', { name: community.name })
    expect(logo.getAttribute('src')).toBe(community.logoUrl)
  })

  it('affiche un repli visuel quand le logo est manquant, sans casser la carte', async () => {
    const community = mockCommunity('repli', { logoUrl: null })
    stubFetchOk([community])

    render(<CommunitiesCarousel />)
    const region = await screen.findByRole('region', { name: REGION_NAME })

    expect(within(region).queryByRole('img')).toBeNull()
    expect(within(region).getByRole('heading', { level: 3, name: community.name })).not.toBeNull()
  })

  it('affiche le repli quand le logo échoue à charger, sans casser la carte', async () => {
    const community = mockCommunity('echec')
    stubFetchOk([community])

    render(<CommunitiesCarousel />)
    const region = await screen.findByRole('region', { name: REGION_NAME })
    const logo = within(region).getByRole('img', { name: community.name })

    fireEvent.error(logo)

    expect(within(region).queryByRole('img')).toBeNull()
    expect(within(region).getByRole('heading', { level: 3, name: community.name })).not.toBeNull()
  })

  it('omet la ligne de description quand elle est manquante, sans laisser d’espace vide', async () => {
    const community = mockCommunity('sansdesc', { description: null })
    stubFetchOk([community])

    render(<CommunitiesCarousel />)
    const region = await screen.findByRole('region', { name: REGION_NAME })

    expect(within(region).getByRole('heading', { level: 3, name: community.name })).not.toBeNull()
    expect(within(region).queryByText('Description', { exact: false })).toBeNull()
  })

  it('n’a aucune carte cliquable : pas de lien, pas de rôle bouton hors navigation', async () => {
    stubFetchOk(mockCommunities('inerte', 3))

    render(<CommunitiesCarousel />)
    const region = await screen.findByRole('region', { name: REGION_NAME })

    expect(within(region).queryAllByRole('link')).toHaveLength(0)
    // Only the Prev/Next controls are buttons — the cards themselves carry no role.
    expect(within(region).getAllByRole('button')).toHaveLength(2)
  })
})

describe('carrousel des communautés — une seule communauté', () => {
  it('affiche une carte unique sans duplication et désactive la navigation', async () => {
    stubFetchOk(mockCommunities('unique', 1))

    render(<CommunitiesCarousel />)
    const region = await screen.findByRole('region', { name: REGION_NAME })

    expect(within(region).getAllByRole('heading', { level: 3 })).toHaveLength(1)
    expect(within(region).getByRole('button', { name: 'Précédent' }).hasAttribute('disabled')).toBe(true)
    expect(within(region).getByRole('button', { name: 'Suivant' }).hasAttribute('disabled')).toBe(true)
  })
})

describe('carrousel des communautés — navigation manuelle', () => {
  it('a des boutons Précédent/Suivant avec un nom accessible', async () => {
    stubFetchOk(mockCommunities('nommage', 3))

    render(<CommunitiesCarousel />)
    const region = await screen.findByRole('region', { name: REGION_NAME })

    expect(within(region).getByRole('button', { name: 'Précédent' })).not.toBeNull()
    expect(within(region).getByRole('button', { name: 'Suivant' })).not.toBeNull()
  })

  it('« Suivant » avance d’une carte puis boucle après le dernier élément', async () => {
    const communities = mockCommunities('suivant', 3)
    stubFetchOk(communities)

    render(<CommunitiesCarousel />)
    const region = await screen.findByRole('region', { name: REGION_NAME })
    const next = within(region).getByRole('button', { name: 'Suivant' })
    const start = transformPx(track())

    fireEvent.click(next)
    // One card width (gap-6 = 24px; jsdom reports 0 real card width).
    expect(Math.abs(transformPx(track()) - (start - 24))).toBeLessThan(2)

    await settleStep()
    fireEvent.click(next)
    await settleStep()
    fireEvent.click(next)
    // Exactly `communities.length` steps is one full loop — back where it started.
    expect(Math.abs(transformPx(track()) - start)).toBeLessThan(2)
  })

  it('ignore un second clic pendant la transition d’un premier pas', async () => {
    stubFetchOk(mockCommunities('rapide', 3))

    render(<CommunitiesCarousel />)
    const region = await screen.findByRole('region', { name: REGION_NAME })
    const next = within(region).getByRole('button', { name: 'Suivant' })
    const start = transformPx(track())

    fireEvent.click(next)
    fireEvent.click(next)
    // The second click lands mid-transition and is dropped — only one card width moved.
    expect(Math.abs(transformPx(track()) - (start - 24))).toBeLessThan(2)
  })

  it('« Précédent » depuis la première carte boucle vers la dernière', async () => {
    stubFetchOk(mockCommunities('precedent', 3))

    render(<CommunitiesCarousel />)
    const region = await screen.findByRole('region', { name: REGION_NAME })
    const prev = within(region).getByRole('button', { name: 'Précédent' })

    fireEvent.click(prev)

    // Wrapped one step backwards from position 0 in a 3-card loop (72px) lands on -48px.
    expect(Math.abs(transformPx(track()) + 48)).toBeLessThan(2)
  })

  it('les flèches clavier gauche/droite naviguent comme les boutons', async () => {
    stubFetchOk(mockCommunities('clavier', 3))

    render(<CommunitiesCarousel />)
    const region = await screen.findByRole('region', { name: REGION_NAME })
    const start = transformPx(track())

    fireEvent.keyDown(region, { key: 'ArrowRight' })
    expect(Math.abs(transformPx(track()) - (start - 24))).toBeLessThan(2)

    await settleStep()
    fireEvent.keyDown(region, { key: 'ArrowLeft' })
    expect(Math.abs(transformPx(track()) - start)).toBeLessThan(2)
  })
})

describe('carrousel des communautés — pause au survol', () => {
  it('met le défilement automatique en pause au survol et reprend à la sortie', async () => {
    stubFetchOk(mockCommunities('survol', 3))

    render(<CommunitiesCarousel />)
    const region = await screen.findByRole('region', { name: REGION_NAME })

    fireEvent.mouseEnter(region)
    const pausedAt = transformPx(track())
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(transformPx(track())).toBe(pausedAt)

    fireEvent.mouseLeave(region)
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(transformPx(track())).not.toBe(pausedAt)
  })
})

import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderAt } from './support/render-route'

const FEATURE_TITLES: [string, string, string] = [
  'Découvrez les évènements',
  'Créez votre agenda',
  "Intégrez à votre application d'agenda",
]

function featureTrigger(title: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
}

describe('fonctionnalités', () => {
  it('présente les trois fonctionnalités comme des déclencheurs distincts', () => {
    renderAt('/lehub')

    for (const title of FEATURE_TITLES) {
      expect(featureTrigger(title)).not.toBeNull()
    }
  })

  it('ouvre la première fonctionnalité par défaut, les deux autres fermées', () => {
    renderAt('/lehub')

    expect(featureTrigger(FEATURE_TITLES[0]).getAttribute('aria-expanded')).toBe('true')
    expect(featureTrigger(FEATURE_TITLES[1]).getAttribute('aria-expanded')).toBe('false')
    expect(featureTrigger(FEATURE_TITLES[2]).getAttribute('aria-expanded')).toBe('false')
  })

  it("n'ouvre qu'une fonctionnalité à la fois", async () => {
    const user = userEvent.setup()
    renderAt('/lehub')

    await user.click(featureTrigger(FEATURE_TITLES[1]))

    expect(featureTrigger(FEATURE_TITLES[0]).getAttribute('aria-expanded')).toBe('false')
    expect(featureTrigger(FEATURE_TITLES[1]).getAttribute('aria-expanded')).toBe('true')
    expect(featureTrigger(FEATURE_TITLES[2]).getAttribute('aria-expanded')).toBe('false')
  })

  it("referme la fonctionnalité ouverte en cliquant dessus à nouveau", async () => {
    const user = userEvent.setup()
    renderAt('/lehub')

    await user.click(featureTrigger(FEATURE_TITLES[0]))

    expect(featureTrigger(FEATURE_TITLES[0]).getAttribute('aria-expanded')).toBe('false')
  })

  it('explique le calendrier personnalisé en langage clair', async () => {
    const user = userEvent.setup()
    renderAt('/lehub')

    await user.click(featureTrigger(FEATURE_TITLES[2]))

    expect(screen.getByText(/elle reflète en permanence les évènements/)).not.toBeNull()
    expect(screen.getByText(/apparaissent automatiquement dans votre agenda/)).not.toBeNull()
  })

  it('donne un nom accessible non vide à chaque visuel de fonctionnalité', () => {
    renderAt('/lehub')

    const visuals = screen.getAllByRole('img', { name: /capture d.?écran/i })
    expect(visuals.length).toBeGreaterThan(0)
    for (const visual of visuals) {
      expect((visual.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0)
    }
  })

  it('utilise des titres de niveau 2 pour les fonctionnalités', () => {
    renderAt('/lehub')

    const level2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    for (const title of FEATURE_TITLES) {
      expect(level2).toContain(title)
    }
  })

  it('ne saute aucun niveau de titre', () => {
    renderAt('/lehub')

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.queryAllByRole('heading', { level: 4 })).toHaveLength(0)
    expect(screen.queryAllByRole('heading', { level: 5 })).toHaveLength(0)
    expect(screen.queryAllByRole('heading', { level: 6 })).toHaveLength(0)
  })
})

import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
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

const ABOUT_SUBTITLES: [string, string, string, string] = [
  'Par la communauté, pour la communauté',
  'Neutralité',
  'Coût',
  'Boîte à idées & contact',
]

function aboutToggle(): HTMLElement {
  return screen.getByRole('button', { name: /À propos de LeHub/ })
}

function aboutRegion(): HTMLElement {
  return screen.getByRole('region', { name: /À propos de LeHub/ })
}

describe('à propos', () => {
  it('est repliée par défaut', () => {
    renderAt('/lehub')

    expect(aboutToggle().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText(/gratuit et le restera toujours/)).toBeNull()
  })

  it('se déplie au clic', async () => {
    const user = userEvent.setup()
    renderAt('/lehub')

    await user.click(aboutToggle())

    expect(aboutToggle().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(/gratuit et le restera toujours/)).not.toBeNull()
  })

  it('répond au clavier', async () => {
    const user = userEvent.setup()
    renderAt('/lehub')

    aboutToggle().focus()
    await user.keyboard('{Enter}')

    expect(aboutToggle().getAttribute('aria-expanded')).toBe('true')
  })

  it('se referme au second déclenchement', async () => {
    const user = userEvent.setup()
    renderAt('/lehub')

    await user.click(aboutToggle())
    await user.click(aboutToggle())

    expect(aboutToggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('n’est pas mémorisée entre deux rendus', async () => {
    const user = userEvent.setup()
    const { unmount } = renderAt('/lehub')
    await user.click(aboutToggle())
    expect(aboutToggle().getAttribute('aria-expanded')).toBe('true')
    unmount()

    renderAt('/lehub')

    expect(aboutToggle().getAttribute('aria-expanded')).toBe('false')
  })

  describe('une fois dépliée', () => {
    async function openAbout(): Promise<ReturnType<typeof userEvent.setup>> {
      const user = userEvent.setup()
      renderAt('/lehub')
      await user.click(aboutToggle())
      return user
    }

    it('ouvre le premier sous-item par défaut, les autres fermés', async () => {
      await openAbout()

      const first = screen.getByRole('button', { name: /Par la communauté, pour la communauté/ })
      const second = screen.getByRole('button', { name: /Neutralité/ })
      const third = screen.getByRole('button', { name: /Coût/ })
      const fourth = screen.getByRole('button', { name: /Boîte à idées/ })

      expect(first.getAttribute('aria-expanded')).toBe('true')
      expect(second.getAttribute('aria-expanded')).toBe('false')
      expect(third.getAttribute('aria-expanded')).toBe('false')
      expect(fourth.getAttribute('aria-expanded')).toBe('false')
    })

    it("n'ouvre qu'un sous-item à la fois", async () => {
      const user = await openAbout()

      await user.click(screen.getByRole('button', { name: /Neutralité/ }))

      expect(screen.getByRole('button', { name: /Neutralité/ }).getAttribute('aria-expanded')).toBe('true')
      expect(
        screen
          .getByRole('button', { name: /Par la communauté, pour la communauté/ })
          .getAttribute('aria-expanded'),
      ).toBe('false')
    })

    it('couvre le positionnement bénévole, la neutralité et le coût', async () => {
      const user = await openAbout()
      const region = aboutRegion()

      expect(within(region).getByText(/gratuit et le restera toujours/)).not.toBeNull()

      await user.click(within(region).getByRole('button', { name: /Neutralité/ }))
      expect(within(region).getByText(/ordre chronologique/)).not.toBeNull()
      expect(within(region).getByText(/ordre alphabétique/)).not.toBeNull()

      await user.click(within(region).getByRole('button', { name: /Coût/ }))
      expect(within(region).getByText(/tenant Azure/)).not.toBeNull()
    })

    it('utilise des titres de niveau 3 pour les sous-items', async () => {
      await openAbout()

      const level3 = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
      for (const title of ABOUT_SUBTITLES) {
        expect(level3).toContain(title)
      }
      expect(screen.getByRole('heading', { level: 2, name: /À propos de LeHub/ })).not.toBeNull()
    })

    it('propose un lien GitHub distinct ouvert dans un nouvel onglet', async () => {
      const user = await openAbout()
      const region = aboutRegion()
      await user.click(within(region).getByRole('button', { name: /Boîte à idées/ }))

      const link = within(region).getByRole('link', { name: /GitHub/ })
      expect(link.getAttribute('href')).toBe('https://github.com/lehub-ms/lehub')
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
      expect(link.getAttribute('rel')).toContain('noreferrer')
    })

    it('propose un lien LinkedIn distinct ouvert dans un nouvel onglet', async () => {
      const user = await openAbout()
      const region = aboutRegion()
      await user.click(within(region).getByRole('button', { name: /Boîte à idées/ }))

      const link = within(region).getByRole('link', { name: /LinkedIn/ })
      expect(link.getAttribute('href')).toBe('https://www.linkedin.com/in/tchinnin')
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
      expect(link.getAttribute('rel')).toContain('noreferrer')
    })
  })
})

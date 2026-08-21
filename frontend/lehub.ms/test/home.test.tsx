import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderAt } from './support/render-route'

describe("page d'accueil — hero pitch", () => {
  it('affiche le titre et le sous-titre', () => {
    renderAt('/')
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent).toContain('LeHub')
    expect(heading.textContent).toContain('des communautés Microsoft Francophones')
  })

  it('affiche une description de la valeur ajoutée', () => {
    renderAt('/')
    expect(screen.getByText(/évènements des communautés Microsoft francophones/)).not.toBeNull()
  })

  it('le bouton principal renvoie vers la page des évènements', () => {
    renderAt('/')
    const link = screen.getByRole('link', { name: /voir les évènements/i })
    expect(link.getAttribute('href')).toBe('/evenements')
  })

  it('le bouton secondaire renvoie vers la page Le Hub', () => {
    renderAt('/')
    const link = screen.getByRole('link', { name: /découvrir lehub/i })
    expect(link.getAttribute('href')).toBe('/lehub')
  })
})

describe("page d'accueil — ordre des sections", () => {
  it('affiche un aperçu des prochains évènements et des communautés, dans cet ordre', () => {
    renderAt('/')

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    const eventsIndex = headings.findIndex((text) => text === 'Les prochains évènements')
    const communitiesIndex = headings.findIndex((text) => text === 'Les communautés partenaires')

    expect(eventsIndex).toBeGreaterThanOrEqual(0)
    expect(communitiesIndex).toBeGreaterThan(eventsIndex)
  })

  it("place les deux sections après le hero", () => {
    renderAt('/')

    const hero = screen.getByRole('heading', { level: 1 })
    const events = screen.getByRole('heading', { name: 'Les prochains évènements' })

    // DOCUMENT_POSITION_FOLLOWING: `events` comes after `hero` in the DOM.
    expect(hero.compareDocumentPosition(events) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

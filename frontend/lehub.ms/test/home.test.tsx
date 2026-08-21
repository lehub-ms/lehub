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

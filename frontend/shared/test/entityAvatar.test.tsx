import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EntityAvatar } from '../src/components/entities/EntityAvatar'
import { communityColor } from '../src/lib/communityPalette'
import type { NamedRef } from '../src/lib/api'

/* Recopié depuis les fixtures du site public plutôt qu'importé : trois lignes, et le socle
   n'a pas de répertoire de support pour un seul appelant. */
function buildNamedRef(prefix: string, index = 1, logoUrl: string | null = null): NamedRef {
  return { id: `${prefix}-${index}`, name: `${prefix} ${index}`, logoUrl }
}

const LOGO = 'https://media.example/technologies/azure.svg'

function logo(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector<HTMLImageElement>('img')
}

describe('EntityAvatar', () => {
  it('renders the logo when the entity has one', () => {
    const entity = buildNamedRef('community', 1, LOGO)
    const { container } = render(<EntityAvatar entity={entity} kind="community" />)

    expect(logo(container)?.getAttribute('src')).toBe(LOGO)
    expect(screen.queryByText('C1')).toBeNull()
  })

  it('falls back to the initials when the logo fails to load, with no broken-image glyph', () => {
    const entity = buildNamedRef('community', 1, LOGO)
    const { container } = render(<EntityAvatar entity={entity} kind="community" />)

    fireEvent.error(logo(container)!)

    expect(logo(container)).toBeNull()
    expect(screen.getByText('C1')).not.toBeNull()
  })

  it('renders the initials directly when no logo is declared', () => {
    const { container } = render(<EntityAvatar entity={buildNamedRef('technology', 1)} kind="technology" />)

    expect(logo(container)).toBeNull()
    expect(screen.getByText('T1')).not.toBeNull()
  })

  it('keeps the same slot whether it shows a logo or its initials, so a mixed list stays aligned', () => {
    const { container } = render(
      <>
        <EntityAvatar entity={buildNamedRef('community', 1, LOGO)} kind="community" size={22} />
        <EntityAvatar entity={buildNamedRef('community', 2)} kind="community" size={22} />
      </>,
    )

    const [withLogo, withoutLogo] = [...container.querySelectorAll<HTMLElement>('[data-avatar]')]
    expect(withLogo?.style.width).toBe('22px')
    expect(withLogo?.style.height).toBe('22px')
    expect(withoutLogo?.style.width).toBe('22px')
    expect(withoutLogo?.style.height).toBe('22px')
  })

  it('constrains any logo format or ratio inside its slot, including a dimensionless SVG', () => {
    const { container } = render(<EntityAvatar entity={buildNamedRef('technology', 1, LOGO)} kind="technology" />)

    // Both axes pinned, or a dimensionless SVG would take the 300x150 replaced-element
    // default; `object-contain` letterboxes rather than crops or stretches.
    expect(logo(container)?.className).toMatch(/size-full/)
    expect(logo(container)?.className).toMatch(/object-contain/)
    expect(container.querySelector<HTMLElement>('[data-avatar]')?.className).toMatch(/overflow-hidden/)
  })

  it('colours a community fallback from the shared AA-verified palette, and a technology fallback neutrally', () => {
    const community = buildNamedRef('community', 1)
    const { container: communityContainer } = render(<EntityAvatar entity={community} kind="community" />)
    const { container: technologyContainer } = render(
      <EntityAvatar entity={buildNamedRef('technology', 1)} kind="technology" />,
    )

    const communityBackground = communityContainer.querySelector<HTMLElement>('[data-avatar]')?.style.backgroundColor
    const technologyBackground = technologyContainer.querySelector<HTMLElement>('[data-avatar]')?.style.backgroundColor
    expect(communityBackground).toBe(hexToRgbString(communityColor(community.id)))
    expect(technologyBackground).toBe(hexToRgbString('#475569'))
  })

  it('leaves the name to the container when it is decorative, and carries it otherwise', () => {
    const entity = buildNamedRef('community', 1, LOGO)
    const { container: decorative } = render(<EntityAvatar entity={entity} kind="community" hidden />)
    const { container: standalone } = render(<EntityAvatar entity={entity} kind="community" />)

    expect(logo(decorative)?.getAttribute('alt')).toBe('')
    expect(decorative.querySelector('[data-avatar]')?.getAttribute('aria-hidden')).toBe('true')
    expect(logo(standalone)?.getAttribute('alt')).toBe(entity.name)
  })
})

/** jsdom normalises an inline hex colour to `rgb(r, g, b)`. */
function hexToRgbString(hex: string): string {
  const value = hex.replace('#', '')
  const channel = (start: number) => parseInt(value.slice(start, start + 2), 16)
  return `rgb(${channel(0)}, ${channel(2)}, ${channel(4)})`
}

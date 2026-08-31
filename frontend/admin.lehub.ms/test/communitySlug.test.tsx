import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PATHS } from '@/lib/navigation'
import { isValidSlug, slugify } from '@/lib/slug'
import { renderAt } from './support/render-route'
import { ADMIN_COMMUNITIES, COMMUNITIES, GLOBAL_ADMIN } from './support/session-fixtures'
import { jsonResponse, stubSignedIn, type FetchOverrides } from './support/stub-session'

const FIRST = COMMUNITIES[0]!
const ADMIN_FIRST = ADMIN_COMMUNITIES[0]!

async function enterSection(path: string) {
  stubSignedIn(GLOBAL_ADMIN)
  const rendered = renderAt(path)
  await screen.findByRole('navigation', { name: 'Navigation principale' })
  await screen.findByRole('link', { name: 'Évènements' })
  return rendered
}

async function openPanel(overrides: FetchOverrides = {}): Promise<void> {
  stubSignedIn(GLOBAL_ADMIN, overrides)
  renderAt(PATHS.communities)
  await screen.findByRole('table')
}

function panel(): HTMLElement {
  return screen.getByRole('dialog')
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('adressage par le slug', () => {
  it('sert la section communauté sur une adresse lisible', async () => {
    const { router } = await enterSection(`/c/${FIRST.slug}/evenements`)

    expect(router.state.location.pathname).toBe(`/c/${FIRST.slug}/evenements`)
  })

  it('sert encore une adresse portant un identifiant, et la ramène à sa forme canonique', async () => {
    // Le critère de #166 : les liens partagés avant le slug continuent de fonctionner.
    const { router } = await enterSection(`/c/${FIRST.id}/evenements`)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/c/${FIRST.slug}/evenements`)
    })
  })

  it('ramène aussi une casse recopiée de travers', async () => {
    const { router } = await enterSection(`/c/${FIRST.slug.toUpperCase()}/organisateurs`)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/c/${FIRST.slug}/organisateurs`)
    })
  })

  it('n’hésite pas entre les deux formes : un slug ne peut pas ressembler à un identifiant', () => {
    expect(isValidSlug(FIRST.id.toLowerCase())).toBe(false)
    expect(isValidSlug(FIRST.slug)).toBe(true)
  })
})

describe('slug dans le panneau', () => {
  it('le propose à partir du nom saisi, et laisse le corriger', async () => {
    await openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle communauté' }))

    fireEvent.change(within(panel()).getByLabelText(/Nom/), {
      target: { value: 'Communauté Azuré de Lyon' },
    })
    const slugField = within(panel()).getByLabelText(/Adresse/)
    expect(slugField).toHaveProperty('value', 'communaute-azure-de-lyon')

    fireEvent.change(slugField, { target: { value: 'azure-lyon' } })
    expect(slugField).toHaveProperty('value', 'azure-lyon')

    // Corrigé à la main, il cesse de suivre le nom.
    fireEvent.change(within(panel()).getByLabelText(/Nom/), { target: { value: 'Autre chose' } })
    expect(within(panel()).getByLabelText(/Adresse/)).toHaveProperty('value', 'azure-lyon')
  })

  it('refuse une saisie mal formée avant tout aller-retour', async () => {
    await openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle communauté' }))

    fireEvent.change(within(panel()).getByLabelText(/Nom/), { target: { value: 'Azure' } })
    fireEvent.change(within(panel()).getByLabelText(/Adresse/), { target: { value: 'Azure Lyon' } })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Enregistrer' }))

    expect(within(panel()).getByText(/minuscules non accentuées/)).not.toBeNull()
  })

  it('n’en propose pas pour une technologie, qui n’en porte pas', async () => {
    stubSignedIn(GLOBAL_ADMIN)
    renderAt(PATHS.technologies)
    await screen.findByRole('table')

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle technologie' }))

    expect(within(panel()).queryByLabelText(/Adresse/)).toBeNull()
  })
})

describe('changement de slug', () => {
  it('prévient que les adresses partagées cesseront de fonctionner, et demande confirmation', async () => {
    await openPanel()
    fireEvent.click(screen.getByRole('button', { name: `Modifier ${ADMIN_FIRST.name}` }))

    fireEvent.change(within(panel()).getByLabelText(/Adresse/), { target: { value: 'aug-france' } })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Enregistrer' }))

    const confirmation = await screen.findByRole('alertdialog')
    expect(within(confirmation).getByText(/cesseront de fonctionner/)).not.toBeNull()
    expect(within(confirmation).getByText('/c/aug-france')).not.toBeNull()
  })

  it('n’avertit pas quand le slug n’a pas bougé', async () => {
    await openPanel()
    fireEvent.click(screen.getByRole('button', { name: `Modifier ${ADMIN_FIRST.name}` }))

    fireEvent.change(within(panel()).getByLabelText(/Nom/), { target: { value: 'Renommée' } })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('nomme la communauté qui porte déjà le slug quand le serveur refuse', async () => {
    await openPanel({
      [`/api/manage/communities/${ADMIN_FIRST.id}`]: () =>
        jsonResponse(
          { code: 'COMMUNITY_SLUG_TAKEN', message: 'taken', holder: 'DevCom Lyon' },
          409,
        ),
    })
    fireEvent.click(screen.getByRole('button', { name: `Modifier ${ADMIN_FIRST.name}` }))

    fireEvent.change(within(panel()).getByLabelText(/Adresse/), { target: { value: 'devcom-lyon' } })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Enregistrer' }))
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Changer l’adresse',
      }),
    )

    // La confirmation se referme d'abord — tant qu'elle est ouverte, Radix rend le reste du
    // document inerte et le panneau n'est pas interrogeable.
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull()
    })
    expect(within(panel()).getByText(/« DevCom Lyon » utilise déjà ce slug/)).not.toBeNull()
  })
})

describe('slugify côté formulaire', () => {
  it('produit les mêmes valeurs que le générateur du serveur', () => {
    // Les deux copies partagent leurs cas ; `api/test/seedSlug.test.ts` tient l'autre bout.
    expect(slugify('Azure User Group France')).toBe('azure-user-group-france')
    expect(slugify('Tech & Wine Marseille')).toBe('tech-wine-marseille')
    expect(slugify('Communauté Azuré')).toBe('communaute-azure')
    expect(slugify('日本語')).toBe('')
  })
})

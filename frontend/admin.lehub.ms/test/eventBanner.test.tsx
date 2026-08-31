import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventPath, newEventPath } from '@/lib/navigation'
import { renderAt } from './support/render-route'
import { ADMIN_EVENTS, COMMUNITIES, ORGANIZER } from './support/session-fixtures'
import { jsonResponse, stubSignedIn } from './support/stub-session'

const AZUG = COMMUNITIES[0]!
/** Celui qui porte déjà une bannière. */
const WITH_BANNER = ADMIN_EVENTS[0]!
/** Celui qui n'en a pas. */
const WITHOUT_BANNER = ADMIN_EVENTS[1]!

const UPLOADED = {
  path: 'events/9f1c.webp',
  url: 'https://media.example/media/events/9f1c.webp',
}

function fetchCalls(): [string, RequestInit | undefined][] {
  const fetchMock = globalThis.fetch as unknown as {
    mock: { calls: [string, RequestInit | undefined][] }
  }
  return fetchMock.mock.calls
}

/** Le corps multipart du dernier téléversement. */
function lastUpload(): FormData {
  const call = fetchCalls()
    .filter(([url]) => url.includes('/api/media/uploads'))
    .at(-1)
  return (call?.[1] as RequestInit).body as FormData
}

function pickBanner(bytes = 'binaire', type = 'image/webp'): void {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
  const file = new File([bytes], 'banner.webp', { type })
  fireEvent.change(input, { target: { files: [file] } })
}

async function open(path: string) {
  const rendered = renderAt(path)
  await screen.findByLabelText('Titre *')
  return rendered
}

beforeEach(() => {
  window.localStorage.clear()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('image bannière', () => {
  it('annonce le format attendu quand il n’y a pas d’image', async () => {
    stubSignedIn(ORGANIZER)
    await open(newEventPath(AZUG.slug))

    expect(screen.getByText('Aucune image')).toBeTruthy()
    // La taille maximale est annoncée, ce que #148 demande explicitement.
    expect(screen.getByText(/1600 × 900 px · JPG, PNG ou WebP · 2 Mo maximum/)).toBeTruthy()
    // Le champ n'accepte que les trois formats — un confort, jamais la protection.
    expect(document.querySelector('input[type="file"]')?.getAttribute('accept')).toBe(
      'image/png,image/jpeg,image/webp',
    )
  })

  it('affiche l’image courante en modification, sans alternative textuelle', async () => {
    stubSignedIn(ORGANIZER, { '/api/manage/events/': () => jsonResponse(WITH_BANNER) })
    await open(eventPath(AZUG.slug, WITH_BANNER.id))

    // Décorative : le titre de l'évènement porte l'information (#148).
    const image = screen.getAllByRole('presentation', { hidden: true }).find((node) => node.tagName === 'IMG')
    expect(image?.getAttribute('src')).toBe(WITH_BANNER.bannerImageUrl)
    expect(image?.getAttribute('alt')).toBe('')
  })

  it('met l’aperçu à jour sans recharger, et retenir le chemin renvoyé', async () => {
    stubSignedIn(ORGANIZER, { '/api/media/uploads': () => jsonResponse(UPLOADED, 201) })
    await open(newEventPath(AZUG.slug))

    pickBanner()

    // L'aperçu bascule sur l'URL rendue par le serveur, jamais sur une recomposition locale.
    await waitFor(() => {
      const image = screen.getAllByRole('presentation', { hidden: true }).find((node) => node.tagName === 'IMG')
      expect(image?.getAttribute('src')).toBe(UPLOADED.url)
    })
    expect(screen.getByText('Remplacer')).toBeTruthy()
  })

  it('déclare la destination, et l’évènement quand il existe', async () => {
    stubSignedIn(ORGANIZER, {
      '/api/media/uploads': () => jsonResponse(UPLOADED, 201),
      '/api/manage/events/': () => jsonResponse(WITHOUT_BANNER),
    })
    await open(eventPath(AZUG.slug, WITHOUT_BANNER.id))

    pickBanner()

    await waitFor(() => {
      expect(lastUpload().get('destination')).toBe('event-banner')
    })
    // C'est lui qui permet à l'API d'arbitrer sur les communautés portées plutôt que sur la
    // seule qualité d'organisateur.
    expect(lastUpload().get('eventId')).toBe(WITHOUT_BANNER.id)
  })

  it('n’envoie aucun évènement à la création, où il n’en existe pas encore', async () => {
    stubSignedIn(ORGANIZER, { '/api/media/uploads': () => jsonResponse(UPLOADED, 201) })
    await open(newEventPath(AZUG.slug))

    pickBanner()

    await waitFor(() => {
      expect(lastUpload().get('destination')).toBe('event-banner')
    })
    expect(lastUpload().get('eventId')).toBeNull()
  })

  it('retire l’image et revient à l’état sans image', async () => {
    stubSignedIn(ORGANIZER, { '/api/manage/events/': () => jsonResponse(WITH_BANNER) })
    await open(eventPath(AZUG.slug, WITH_BANNER.id))

    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }))

    expect(screen.getByText('Aucune image')).toBeTruthy()
    expect(screen.getByText('Importer une image')).toBeTruthy()
  })

  it('enregistre le chemin, pas l’URL', async () => {
    stubSignedIn(ORGANIZER, {
      '/api/media/uploads': () => jsonResponse(UPLOADED, 201),
      '/api/manage/events/': () => jsonResponse(WITHOUT_BANNER),
    })
    await open(eventPath(AZUG.slug, WITHOUT_BANNER.id))

    pickBanner()
    await waitFor(() => {
      expect(screen.getByText('Remplacer')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => {
      const patch = fetchCalls()
        .filter(([url, init]) => url.includes('/api/manage/events/') && init?.method === 'PATCH')
        .at(-1)
      const sent = JSON.parse((patch?.[1] as RequestInit).body as string) as Record<string, unknown>
      // Un chemin relatif au conteneur, jamais une adresse absolue : c'est la règle de la
      // migration 0003 et de la Feature #70, pour que la donnée vaille dans tous les
      // environnements.
      expect(sent.bannerImagePath).toBe(UPLOADED.path)
    })
  })

  it('restitue le refus de type du serveur, en français', async () => {
    // Le contrôle côté client peut être contourné ; c'est le serveur qui décide, sur les octets.
    stubSignedIn(ORGANIZER, {
      '/api/media/uploads': () => jsonResponse({ code: 'UNSUPPORTED_MEDIA_TYPE' }, 415),
    })
    await open(newEventPath(AZUG.slug))

    pickBanner()

    expect((await screen.findByRole('alert')).textContent).toContain('JPG, PNG ou WebP')
    expect(screen.getByText('Aucune image')).toBeTruthy()
  })

  it('restitue le refus d’habilitation', async () => {
    stubSignedIn(ORGANIZER, {
      '/api/media/uploads': () => jsonResponse({ code: 'FORBIDDEN' }, 403),
      '/api/manage/events/': () => jsonResponse(WITHOUT_BANNER),
    })
    await open(eventPath(AZUG.slug, WITHOUT_BANNER.id))

    pickBanner()

    expect((await screen.findByRole('alert')).textContent).toContain('pas autorisé à déposer')
  })

  it('refuse un fichier trop lourd sans même l’envoyer', async () => {
    stubSignedIn(ORGANIZER)
    await open(newEventPath(AZUG.slug))

    pickBanner('x'.repeat(2 * 1024 * 1024 + 1))

    expect((await screen.findByRole('alert')).textContent).toContain('dépasse 2 Mo')
    expect(fetchCalls().some(([url]) => url.includes('/api/media/uploads'))).toBe(false)
  })
})

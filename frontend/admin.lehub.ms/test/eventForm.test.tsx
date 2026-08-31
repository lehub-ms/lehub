import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { communityPath, newEventPath } from '@/lib/navigation'
import { fromLocalInput, toLocalInput } from '@/lib/eventDates'
import { renderAt } from './support/render-route'
import { COMMUNITIES, EVENT_OPTIONS, GLOBAL_ADMIN, ORGANIZER } from './support/session-fixtures'
import { jsonResponse, stubSignedIn } from './support/stub-session'

const AZUG = COMMUNITIES[0]!
const NEW_PATH = newEventPath(AZUG.slug)
const LIST_PATH = communityPath(AZUG.slug, 'evenements')

const MEETUP = EVENT_OPTIONS.formats.find((option) => option.name === 'Meetup')!
const ONSITE = EVENT_OPTIONS.modes.find((option) => option.name === 'Présentiel')!

/** Le formulaire n'apparaît qu'une fois les vocabulaires lus. */
async function openForm(): Promise<void> {
  renderAt(NEW_PATH)
  await screen.findByLabelText('Titre *')
}

function field(label: string): HTMLElement {
  return screen.getByLabelText(label)
}

/**
 * Les POST vers la route des évènements — et **seulement** vers elle.
 *
 * L'ouverture de session est elle aussi un POST : filtrer sur la seule méthode compterait
 * `/api/me/session` comme une création, et le test « rien n'est parti » passerait toujours.
 */
function creations(): RequestInit[] {
  // Même déballage que `referenceDelete` : le type de `fetch` accepte une `URL` ou une
  // `Request`, que la substitution n'émet jamais.
  const fetchMock = globalThis.fetch as unknown as {
    mock: { calls: [string, RequestInit | undefined][] }
  }
  return fetchMock.mock.calls
    .filter(([url, init]) => url.includes('/api/manage/events') && init?.method === 'POST')
    .map(([, init]) => init as RequestInit)
}

/** Le corps de la dernière création. */
function lastCreate(): Record<string, unknown> {
  return JSON.parse(creations().at(-1)?.body as string) as Record<string, unknown>
}

/** Remplit tout ce que le formulaire exige, sauf ce que le test veut voir manquer. */
function fillValidForm(overrides: { start?: string; end?: string } = {}): void {
  fireEvent.change(field('Titre *'), { target: { value: 'Azure Deep Dive' } })
  fireEvent.change(field('Début *'), { target: { value: overrides.start ?? '2026-09-10T18:30' } })
  fireEvent.change(field('Fin *'), { target: { value: overrides.end ?? '2026-09-10T21:00' } })
  fireEvent.change(field('Type *'), { target: { value: MEETUP.id } })
  fireEvent.click(screen.getByRole('radio', { name: 'Présentiel' }))
}

function submit(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
}

/** Capturée plutôt que relue sur `window` : une méthode détachée de son objet déclenche
    `@typescript-eslint/unbound-method`, et l'espion est de toute façon ce qu'on interroge. */
let confirmSpy: MockInstance<(message?: string) => boolean>

beforeEach(() => {
  window.localStorage.clear()
  // jsdom ne l'implémente pas et lève ; la garde de sortie s'en sert.
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('création d’un évènement', () => {
  it('a sa propre route, atteignable directement', async () => {
    stubSignedIn(ORGANIZER)
    await openForm()

    expect(screen.getByRole('heading', { level: 1, name: 'Nouvel évènement' })).toBeTruthy()
    // Le fil d'ariane ramène à la liste, et c'est la sortie normale.
    const crumb = screen.getByRole('navigation', { name: 'Fil d’ariane' })
    expect(crumb.querySelector('a')?.getAttribute('href')).toBe(LIST_PATH)
  })

  it('propose les six types et les trois formats du référentiel', async () => {
    stubSignedIn(ORGANIZER)
    await openForm()

    // « Choisir un type… » en tête : rien n'est présélectionné, le choix est demandé.
    expect(screen.getAllByRole('option')).toHaveLength(EVENT_OPTIONS.formats.length + 1)
    expect(screen.getAllByRole('radio')).toHaveLength(EVENT_OPTIONS.modes.length)
    expect(screen.getAllByRole('radio').every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true)
  })

  it('refuse l’enregistrement et signale le premier champ fautif', async () => {
    stubSignedIn(ORGANIZER)
    await openForm()

    submit()

    expect(screen.getByText('Le titre est obligatoire.')).toBeTruthy()
    expect(screen.getByText('La date de début est obligatoire.')).toBeTruthy()
    expect(screen.getByText('La date de fin est obligatoire.')).toBeTruthy()
    expect(screen.getByText('Le type est obligatoire.')).toBeTruthy()
    expect(screen.getByText('Le format est obligatoire.')).toBeTruthy()
    // Le premier dans l'ordre de l'écran reçoit le focus.
    expect(document.activeElement).toBe(field('Titre *'))
    // Rien n'est parti.
    expect(creations()).toHaveLength(0)
  })

  it('focalise le format quand il est le seul manquant', async () => {
    stubSignedIn(ORGANIZER)
    await openForm()

    fireEvent.change(field('Titre *'), { target: { value: 'Azure Deep Dive' } })
    fireEvent.change(field('Début *'), { target: { value: '2026-09-10T18:30' } })
    fireEvent.change(field('Fin *'), { target: { value: '2026-09-10T21:00' } })
    fireEvent.change(field('Type *'), { target: { value: MEETUP.id } })
    submit()

    // Un `radiogroup` n'est pas focalisable : c'est sa première option qui l'est, et c'est le
    // point d'entrée clavier du groupe.
    expect(document.activeElement).toBe(screen.getAllByRole('radio')[0])
  })

  it('refuse une date de fin antérieure au début', async () => {
    stubSignedIn(ORGANIZER)
    await openForm()

    fillValidForm({ start: '2026-09-10T18:30', end: '2026-09-10T17:00' })
    submit()

    expect(screen.getByText('La date de fin doit être postérieure à la date de début.')).toBeTruthy()
  })

  it('efface l’erreur d’un champ dès qu’on le corrige', async () => {
    stubSignedIn(ORGANIZER)
    await openForm()

    submit()
    expect(screen.getByText('Le titre est obligatoire.')).toBeTruthy()

    fireEvent.change(field('Titre *'), { target: { value: 'A' } })
    expect(screen.queryByText('Le titre est obligatoire.')).toBeNull()
    // Les autres restent : on n'a corrigé qu'un champ.
    expect(screen.getByText('Le type est obligatoire.')).toBeTruthy()
  })

  it('envoie des instants, convertis depuis l’heure de Paris', async () => {
    stubSignedIn(ORGANIZER)
    await openForm()

    fillValidForm()
    submit()

    await waitFor(() => {
      expect(lastCreate().startDate).toBe('2026-09-10T16:30:00.000Z')
    })
    // 18:30 à Paris en septembre, c'est 16:30 UTC : deux heures d'heure d'été. Envoyée telle
    // quelle, la saisie aurait décalé l'évènement de deux heures sur lehub.ms.
    expect(lastCreate().endDate).toBe('2026-09-10T19:00:00.000Z')
  })

  it('rattache d’office la communauté sélectionnée', async () => {
    stubSignedIn(ORGANIZER)
    await openForm()

    fillValidForm()
    submit()

    await waitFor(() => {
      expect(lastCreate().communityIds).toEqual([AZUG.id])
    })
    expect(lastCreate().formatTypeId).toBe(MEETUP.id)
    expect(lastCreate().eventModeId).toBe(ONSITE.id)
  })

  it('ramène à la liste une fois enregistré', async () => {
    stubSignedIn(ORGANIZER)
    const { router } = renderAt(NEW_PATH)
    await screen.findByLabelText('Titre *')

    fillValidForm()
    submit()

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(LIST_PATH)
    })
  })

  it('rend une description vide en absence de description', async () => {
    stubSignedIn(ORGANIZER)
    await openForm()

    fillValidForm()
    fireEvent.change(field('Description'), { target: { value: '   ' } })
    submit()

    await waitFor(() => {
      expect(lastCreate().description).toBeNull()
    })
  })

  it('restitue un refus d’habilitation sans perdre la saisie', async () => {
    // L'edge case de #145 : la désignation a été retirée entre l'ouverture et l'enregistrement.
    stubSignedIn(ORGANIZER, {
      '/api/manage/events': () => jsonResponse({ code: 'FORBIDDEN' }, 403),
    })
    renderAt(NEW_PATH)
    await screen.findByLabelText('Titre *')

    fillValidForm()
    submit()

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('plus autorisé')
    expect((field('Titre *') as HTMLInputElement).value).toBe('Azure Deep Dive')
  })

  it('rattache aussi la communauté pour un administrateur global', async () => {
    // Le formulaire vit *sous* une communauté : sa route en porte le slug, donc il y a
    // toujours une communauté à rattacher, administrateur ou non. L'évènement sans aucun
    // rattachement — l'edge case de #145 — reste possible côté API, où `canCreateEvent` le
    // réserve aux administrateurs, mais aucun écran ne l'offre aujourd'hui.
    stubSignedIn(GLOBAL_ADMIN)
    renderAt(NEW_PATH)
    await screen.findByLabelText('Titre *')

    fillValidForm()
    submit()

    await waitFor(() => {
      expect(lastCreate().communityIds).toEqual([AZUG.id])
    })
  })
})

describe('garde de sortie', () => {
  it('demande confirmation avant d’abandonner une saisie', async () => {
    stubSignedIn(ORGANIZER)
    const { router } = renderAt(NEW_PATH)
    await screen.findByLabelText('Titre *')

    fireEvent.change(field('Titre *'), { target: { value: 'Brouillon' } })
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled()
    })
    // Confirmé, donc la navigation aboutit.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(LIST_PATH)
    })
  })

  it('reste sur place quand on refuse d’abandonner', async () => {
    confirmSpy.mockReturnValue(false)
    stubSignedIn(ORGANIZER)
    const { router } = renderAt(NEW_PATH)
    await screen.findByLabelText('Titre *')

    fireEvent.change(field('Titre *'), { target: { value: 'Brouillon' } })
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled()
    })
    expect(router.state.location.pathname).toBe(NEW_PATH)
    expect((field('Titre *') as HTMLInputElement).value).toBe('Brouillon')
  })

  it('ne demande rien quand rien n’a été saisi', async () => {
    stubSignedIn(ORGANIZER)
    const { router } = renderAt(NEW_PATH)
    await screen.findByLabelText('Titre *')

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(LIST_PATH)
    })
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('ne demande rien après un enregistrement réussi', async () => {
    stubSignedIn(ORGANIZER)
    const { router } = renderAt(NEW_PATH)
    await screen.findByLabelText('Titre *')

    fillValidForm()
    submit()

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(LIST_PATH)
    })
    // Enregistrer n'est pas abandonner : la garde est levée avant la navigation.
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})

describe('conversion heure murale / instant', () => {
  it('applique l’heure d’été et l’heure d’hiver', () => {
    // +2 h en septembre, +1 h en janvier. La règle vient d'`Intl`, pas d'une constante.
    expect(fromLocalInput('2026-09-10T18:30')).toBe('2026-09-10T16:30:00.000Z')
    expect(fromLocalInput('2026-01-15T18:30')).toBe('2026-01-15T17:30:00.000Z')
  })

  it('fait l’aller-retour sans dériver, y compris autour des bascules', () => {
    for (const local of ['2026-03-29T04:30', '2026-10-25T04:30', '2026-06-21T00:00']) {
      expect(toLocalInput(fromLocalInput(local)!)).toBe(local)
    }
  })

  it('rend `null` sur une saisie illisible plutôt que d’inventer un instant', () => {
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('2026-09-10')).toBeNull()
    expect(toLocalInput('pas une date')).toBe('')
  })
})

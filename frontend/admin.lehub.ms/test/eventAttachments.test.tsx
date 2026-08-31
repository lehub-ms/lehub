import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { SessionPermissions } from '@lehub/shared/auth/AuthContext'
import {
  communityChips,
  CONFIRM_HANDOVER,
  LOCKED_LAST,
  LOCKED_THIRD_PARTY,
  SHARING_NOTE,
} from '@/lib/eventAttachments'
import { eventPath, newEventPath } from '@/lib/navigation'
import { renderAt } from './support/render-route'
import {
  ADMIN_EVENTS,
  COMMUNITIES,
  GLOBAL_ADMIN,
  ORGANIZER,
  TECHNOLOGIES,
} from './support/session-fixtures'
import { jsonResponse, stubSignedIn } from './support/stub-session'

const AZUG = COMMUNITIES[0]!
const PPF = COMMUNITIES[1]!

/** Celui que les deux communautés co-organisent. */
const SHARED = ADMIN_EVENTS[1]!
const OWN = ADMIN_EVENTS[0]!

const ORGANIZES_BOTH: SessionPermissions = {
  isGlobalAdmin: false,
  organizedCommunityIds: [AZUG.id, PPF.id],
}

let confirmSpy: MockInstance<(message?: string) => boolean>

/** Le groupe de pastilles d'une légende donnée. */
function group(legend: string): HTMLElement {
  return screen.getByRole('group', { name: legend })
}

/**
 * Les pastilles cochées, par leur **nom accessible**.
 *
 * Pas par `textContent` : l'avatar y ajoute les initiales de repli — « AUAzure User Group
 * France » — alors qu'il est `aria-hidden` et ne compte donc pas dans le nom annoncé. C'est ce
 * dernier qui décrit ce qu'entend quelqu'un qui n'a pas l'écran.
 */
function pressed(legend: string, candidates: readonly string[]): string[] {
  return candidates.filter(
    (name) =>
      within(group(legend)).getByRole('button', { name }).getAttribute('aria-pressed') === 'true',
  )
}

const COMMUNITY_NAMES = [AZUG.name, PPF.name]
const TECHNOLOGY_NAMES = TECHNOLOGIES.map((technology) => technology.name)

async function open(path: string) {
  const rendered = renderAt(path)
  await screen.findByLabelText('Titre *')
  return rendered
}

beforeEach(() => {
  window.localStorage.clear()
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('rattachements à l’écran', () => {
  it('coche d’office la communauté sélectionnée à la création', async () => {
    stubSignedIn(ORGANIZER)
    await open(newEventPath(AZUG.slug))

    expect(pressed('Communautés', COMMUNITY_NAMES)).toEqual([AZUG.name])
    // Elle est visible, pas seulement envoyée : la pastille montre le rattachement plutôt que
    // de le faire dans le dos.
    expect(within(group('Communautés')).getByRole('button', { name: AZUG.name })).toBeTruthy()
  })

  it('énonce que rattacher une communauté en partage la gestion', async () => {
    stubSignedIn(ORGANIZER)
    await open(newEventPath(AZUG.slug))

    expect(screen.getByText(SHARING_NOTE)).toBeTruthy()
  })

  it('propose toutes les communautés actives, y compris celles qu’on n’organise pas', async () => {
    // Le point de #147 : c'est ainsi qu'une soirée commune se monte sans passer par un
    // administrateur. `ORGANIZER` n'organise pas Power Platform France et peut la rattacher.
    stubSignedIn(ORGANIZER)
    await open(newEventPath(AZUG.slug))

    const other = within(group('Communautés')).getByRole('button', { name: PPF.name })
    expect(other.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(other)
    expect(pressed('Communautés', COMMUNITY_NAMES)).toEqual([AZUG.name, PPF.name])
  })

  it('annonce l’état sélectionné de chaque pastille', async () => {
    stubSignedIn(ORGANIZER)
    await open(newEventPath(AZUG.slug))

    // `aria-pressed` et non une classe : c'est ce qui annonce une bascule aux technologies
    // d'assistance, et ce qui la rend utilisable au clavier sans code supplémentaire.
    for (const button of within(group('Technologies')).getAllByRole('button')) {
      expect(button.getAttribute('aria-pressed')).toBe('false')
    }
    fireEvent.click(within(group('Technologies')).getByRole('button', { name: 'Azure' }))
    expect(pressed('Technologies', TECHNOLOGY_NAMES)).toEqual(['Azure'])
  })

  it('envoie les rattachements cochés', async () => {
    stubSignedIn(ORGANIZER)
    await open(newEventPath(AZUG.slug))

    fireEvent.change(screen.getByLabelText('Titre *'), { target: { value: 'Soirée commune' } })
    fireEvent.change(screen.getByLabelText('Début *'), { target: { value: '2026-09-10T18:30' } })
    fireEvent.change(screen.getByLabelText('Fin *'), { target: { value: '2026-09-10T21:00' } })
    fireEvent.change(screen.getByLabelText('Type *'), {
      target: { value: 'F2F2F2F2-0000-0000-0000-000000000002' },
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Présentiel' }))
    fireEvent.click(within(group('Communautés')).getByRole('button', { name: PPF.name }))
    fireEvent.click(within(group('Technologies')).getByRole('button', { name: 'Azure' }))

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => {
      const fetchMock = globalThis.fetch as unknown as {
        mock: { calls: [string, RequestInit | undefined][] }
      }
      const created = fetchMock.mock.calls.find(
        ([url, init]) => url.includes('/api/manage/events') && init?.method === 'POST',
      )
      const sent = JSON.parse(created?.[1]?.body as string) as Record<string, unknown>
      expect(sent.communityIds).toEqual([AZUG.id, PPF.id])
      expect(sent.technologyIds).toEqual([TECHNOLOGIES[0]!.id])
    })
  })

  it('garde visible et retirable une entrée archivée déjà rattachée', async () => {
    // « Silverlight » est archivée : elle n'est pas dans `/api/technologies`, mais l'évènement
    // la porte. Elle reste affichée — c'est tout l'intérêt d'archiver plutôt que de supprimer.
    const archived = { id: 'B3B3B3B3-0000-0000-0000-000000000003', name: 'Silverlight', logoUrl: null, archived: true }
    stubSignedIn(ORGANIZER, {
      '/api/manage/events/': () => jsonResponse({ ...OWN, technologies: [archived] }),
    })
    await open(eventPath(AZUG.slug, OWN.id))

    const chipEl = within(group('Technologies')).getByRole('button', { name: /Silverlight/ })
    expect(chipEl.getAttribute('aria-pressed')).toBe('true')
    expect(chipEl.textContent).toContain('Archivée')

    fireEvent.click(chipEl)
    expect(chipEl.getAttribute('aria-pressed')).toBe('false')
  })
})

describe('règles de retrait des communautés', () => {
  it('refuse de retirer une communauté tierce, et dit pourquoi', async () => {
    stubSignedIn(ORGANIZER, { '/api/manage/events/': () => jsonResponse(SHARED) })
    await open(eventPath(AZUG.slug, SHARED.id))

    const other = within(group('Communautés')).getByRole('button', { name: PPF.name })
    expect(other.getAttribute('title')).toBe(LOCKED_THIRD_PARTY)

    fireEvent.click(other)
    // Toujours cochée : le clic n'a rien fait, et la raison est lisible.
    expect(other.getAttribute('aria-pressed')).toBe('true')
  })

  it('refuse de retirer la dernière communauté', async () => {
    stubSignedIn(ORGANIZER, { '/api/manage/events/': () => jsonResponse(OWN) })
    await open(eventPath(AZUG.slug, OWN.id))

    const only = within(group('Communautés')).getByRole('button', { name: AZUG.name })
    expect(only.getAttribute('title')).toBe(LOCKED_LAST)

    fireEvent.click(only)
    expect(only.getAttribute('aria-pressed')).toBe('true')
  })

  it('confirme le passage de main avant de retirer la dernière qu’on organise', async () => {
    stubSignedIn(ORGANIZER, { '/api/manage/events/': () => jsonResponse(SHARED) })
    await open(eventPath(AZUG.slug, SHARED.id))

    fireEvent.click(within(group('Communautés')).getByRole('button', { name: AZUG.name }))

    expect(confirmSpy).toHaveBeenCalledWith(CONFIRM_HANDOVER)
    expect(pressed('Communautés', COMMUNITY_NAMES)).toEqual([PPF.name])
  })

  it('renonce au passage de main quand la confirmation est refusée', async () => {
    confirmSpy.mockReturnValue(false)
    stubSignedIn(ORGANIZER, { '/api/manage/events/': () => jsonResponse(SHARED) })
    await open(eventPath(AZUG.slug, SHARED.id))

    fireEvent.click(within(group('Communautés')).getByRole('button', { name: AZUG.name }))

    expect(pressed('Communautés', COMMUNITY_NAMES)).toEqual([AZUG.name, PPF.name])
  })

  it('n’oppose aucune de ces règles à un administrateur', async () => {
    stubSignedIn(GLOBAL_ADMIN, { '/api/manage/events/': () => jsonResponse(SHARED) })
    await open(eventPath(AZUG.slug, SHARED.id))

    for (const name of [AZUG.name, PPF.name]) {
      const button = within(group('Communautés')).getByRole('button', { name })
      expect(button.getAttribute('title')).toBeNull()
      fireEvent.click(button)
    }
    expect(pressed('Communautés', COMMUNITY_NAMES)).toEqual([])
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('laisse décocher une communauté tierce qu’on vient d’ajouter', async () => {
    // Décocher ce qu'on vient de cocher n'est pas un retrait : le serveur compare à ce qui est
    // en base, où elle ne figure pas encore. Interdire ici ce qu'il autorise là piégerait
    // quelqu'un sur son propre clic.
    stubSignedIn(ORGANIZER, { '/api/manage/events/': () => jsonResponse(OWN) })
    await open(eventPath(AZUG.slug, OWN.id))

    const other = within(group('Communautés')).getByRole('button', { name: PPF.name })
    fireEvent.click(other)
    expect(other.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(other)
    expect(other.getAttribute('aria-pressed')).toBe('false')
  })
})

describe('règles de retrait, en isolation', () => {
  const azug = { id: AZUG.id, name: AZUG.name, logoUrl: null }
  const ppf = { id: PPF.id, name: PPF.name, logoUrl: null }

  function reasons(input: Parameters<typeof communityChips>[0]) {
    return Object.fromEntries(
      communityChips(input).map((entry) => [entry.name, entry.lockedReason ?? entry.confirmRemoval ?? null]),
    )
  }

  it('ne verrouille rien sur une communauté non cochée', () => {
    expect(
      reasons({ offered: [azug, ppf], attached: [azug], selected: [azug.id], permissions: ORGANIZER }),
    ).toMatchObject({ [PPF.name]: null })
  })

  it('bloque le retrait de toutes les communautés à la fois', () => {
    // Chacune passerait seule, et pourtant les deux ensemble videraient l'évènement. C'est le
    // cas que des contrôles par entrée ne voient pas, et il vaut aussi à l'écran.
    const chips = communityChips({
      offered: [azug, ppf],
      attached: [azug, ppf],
      selected: [azug.id],
      permissions: ORGANIZES_BOTH,
    })

    expect(chips.find((entry) => entry.id === azug.id)?.lockedReason).toBe(LOCKED_LAST)
  })

  it('compare les identifiants sans égard à la casse', () => {
    const lower: SessionPermissions = {
      isGlobalAdmin: false,
      organizedCommunityIds: [AZUG.id.toLowerCase()],
    }
    const chips = communityChips({
      offered: [azug, ppf],
      attached: [azug, ppf],
      selected: [azug.id, ppf.id],
      permissions: lower,
    })

    // Reconnue comme sienne malgré la casse : sinon on la croirait tierce et on la verrouillerait.
    expect(chips.find((entry) => entry.id === azug.id)?.confirmRemoval).toBe(CONFIRM_HANDOVER)
    expect(chips.find((entry) => entry.id === ppf.id)?.lockedReason).toBe(LOCKED_THIRD_PARTY)
  })
})

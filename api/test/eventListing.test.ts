import { HttpRequest, InvocationContext } from '@azure/functions'
import { describe, expect, it } from 'vitest'
import { adminEvents } from '../src/functions/adminEvents'
import { LIST_COMMUNITY_EVENTS_QUERY, mapAdminEvent } from '../src/lib/eventsRepo'
import { type MediaConfig } from '../src/lib/mediaUrls'
import { type SessionPermissions } from '../src/lib/permissionsRepo'
import { type AuthenticatedIdentity } from '../src/lib/tokenValidation'
import { type AuthenticatedSession } from '../src/lib/withAuthorization'

const IDENTITY: AuthenticatedIdentity = {
  objectId: 'c722f670-cebf-4f94-b3b2-1723bfa372e6',
  email: 'organisateur@example.com',
  givenName: 'Amélie',
  familyName: 'Rousseau',
}

const COMMUNITY = 'C1C1C1C1-0000-0000-0000-000000000001'
const OTHER_COMMUNITY = 'C2C2C2C2-0000-0000-0000-000000000002'

const ADMIN: SessionPermissions = { isGlobalAdmin: true, organizedCommunityIds: [] }
const ORGANIZER: SessionPermissions = { isGlobalAdmin: false, organizedCommunityIds: [COMMUNITY] }
const OUTSIDER: SessionPermissions = { isGlobalAdmin: false, organizedCommunityIds: [] }

function session(permissions: SessionPermissions): AuthenticatedSession {
  return { identity: IDENTITY, permissions }
}

function list(query: string): HttpRequest {
  return new HttpRequest({
    method: 'GET',
    url: `https://api.example.com/api/manage/events${query}`,
    headers: {},
  })
}

/** Capture les appels à context.error sans dépendre de l'hôte Functions. */
function context(): InvocationContext & { errors: unknown[][] } {
  const errors: unknown[][] = []
  const ctx = new InvocationContext({ functionName: 'test' }) as InvocationContext & {
    errors: unknown[][]
  }
  ctx.error = (...args: unknown[]) => void errors.push(args)
  ctx.errors = errors
  return ctx
}

function code(response: { jsonBody?: unknown }): string {
  return (response.jsonBody as { code: string }).code
}

/**
 * Comme `referenceWrites`, cette suite s'arrête à ce que la couche HTTP décide sans base : le
 * refus et la validation. La lecture elle-même appartient au repository, dont la partie pure —
 * la projection — est éprouvée plus bas, et à la boucle locale.
 */
describe('habilitation de la liste des évènements', () => {
  it("refuse la communauté qu'on n'organise pas, et le journalise", async () => {
    const ctx = context()
    const response = await adminEvents(
      list(`?communityId=${OTHER_COMMUNITY}`),
      ctx,
      session(ORGANIZER),
    )

    expect(response.status).toBe(403)
    expect(code(response)).toBe('FORBIDDEN')
    expect(JSON.stringify(ctx.errors)).toContain('read:community-events')
  })

  it("refuse un compte sans aucune désignation", async () => {
    const response = await adminEvents(list(`?communityId=${COMMUNITY}`), context(), session(OUTSIDER))

    expect(response.status).toBe(403)
  })

  it('ne nomme rien dans le corps du refus', async () => {
    // Un refus qui dirait « cette communauté ne vous appartient pas » confirmerait son
    // existence à qui n'a pas à le savoir. Le message est le même partout, et l'identifiant
    // demandé ne va qu'au journal, dans la route que celui-ci porte déjà.
    const response = await adminEvents(
      list(`?communityId=${OTHER_COMMUNITY}`),
      context(),
      session(ORGANIZER),
    )

    expect(JSON.stringify(response.jsonBody)).not.toContain(OTHER_COMMUNITY)
  })

  it("laisse passer l'organisateur de la communauté demandée", async () => {
    // Sans base ni conteneur média, la lecture échoue ensuite — ce qui est justement la
    // preuve que le portillon a été franchi. C'est l'absence de 403 qui est assertée, pas
    // le 500 qui suit.
    const response = await adminEvents(list(`?communityId=${COMMUNITY}`), context(), session(ORGANIZER))

    expect(response.status).not.toBe(403)
  })

  it('laisse passer un administrateur sur une communauté quelconque', async () => {
    const response = await adminEvents(
      list(`?communityId=${OTHER_COMMUNITY}`),
      context(),
      session(ADMIN),
    )

    expect(response.status).not.toBe(403)
  })
})

describe('validation de la chaîne de requête', () => {
  it('refuse une requête sans communauté', async () => {
    const response = await adminEvents(list(''), context(), session(ADMIN))

    expect(response.status).toBe(400)
    expect(code(response)).toBe('INVALID_QUERY')
  })

  it("refuse un identifiant qui n'en est pas un, plutôt que de le passer au pilote", async () => {
    // Laissé passer, un identifiant malformé remonterait en erreur mssql et en 500, ce qui se
    // lit comme une panne plutôt que comme un mauvais lien.
    const response = await adminEvents(list('?communityId=azure-user-group'), context(), session(ADMIN))

    expect(response.status).toBe(400)
    expect(code(response)).toBe('INVALID_QUERY')
  })

  it('refuse un paramètre mal orthographié plutôt que de le laisser sans effet', async () => {
    const ctx = context()
    const response = await adminEvents(list(`?communityid=${COMMUNITY}`), ctx, session(ADMIN))

    expect(response.status).toBe(400)
    expect(JSON.stringify(ctx.errors)).toContain('unrecognized_keys')
  })

  it("n'échoue pas sur la validation avant d'avoir de quoi arbitrer", async () => {
    // La validation précède ici l'autorisation, à rebours du reste de l'API, parce que
    // l'habilitation *est* le paramètre. Ce test fige cet ordre : une requête à la fois
    // malformée et non habilitée répond 400, et non 403.
    const response = await adminEvents(list('?communityId=pas-un-guid'), context(), session(OUTSIDER))

    expect(response.status).toBe(400)
  })
})

describe("projection d'un évènement pour le backoffice", () => {
  const media: MediaConfig = { baseUrl: 'https://media.example.net/media' }

  const row = {
    Id: 'E1E1E1E1-0000-0000-0000-000000000001',
    Title: 'Azure Deep Dive',
    Description: 'Réseau et sécurité.',
    StartDate: new Date('2026-09-10T16:30:00Z'),
    EndDate: new Date('2026-09-10T19:00:00Z'),
    BannerImagePath: 'events/banner.webp',
    FormatTypeId: 'F2F2F2F2-0000-0000-0000-000000000002',
    Format: 'Meetup',
    EventModeId: 'D1D1D1D1-0000-0000-0000-000000000001',
    Mode: 'Présentiel',
    Communities: '[{"id":"c1","name":"AZUG","archived":0}]',
    Technologies: null,
  }

  it('rend le chemin du blob *et* son URL', () => {
    // Le formulaire renvoie le chemin tel quel à l'enregistrement ; l'aperçu affiche l'URL.
    // Recomposer l'un depuis l'autre mettrait `mediaUrls` dans le navigateur.
    const event = mapAdminEvent(media)(row)

    expect(event.bannerImagePath).toBe('events/banner.webp')
    expect(event.bannerImageUrl).toBe('https://media.example.net/media/events/banner.webp')
  })

  it('rend les identifiants du type et du format, pas seulement leurs libellés', () => {
    // Sans eux, le formulaire devrait présélectionner ses listes en comparant des libellés.
    const event = mapAdminEvent(media)(row)

    expect(event.formatTypeId).toBe(row.FormatTypeId)
    expect(event.format).toBe('Meetup')
    expect(event.eventModeId).toBe(row.EventModeId)
    expect(event.mode).toBe('Présentiel')
  })

  it('rend les dates en ISO et une absence de rattachement en tableau vide', () => {
    const event = mapAdminEvent(media)(row)

    expect(event.startDate).toBe('2026-09-10T16:30:00.000Z')
    expect(event.endDate).toBe('2026-09-10T19:00:00.000Z')
    // FOR JSON PATH ne rend rien plutôt qu'un tableau vide quand il n'y a aucune ligne.
    expect(event.technologies).toEqual([])
    expect(event.communities).toEqual([
      { id: 'c1', name: 'AZUG', logoUrl: null, archived: false },
    ])
  })
})

describe('requête de liste', () => {
  it('ne filtre pas les évènements passés', () => {
    // Le repli du passé est une décision de rendu (#174). Filtré ici, « la recherche traverse
    // le repli » deviendrait impossible à tenir.
    expect(LIST_COMMUNITY_EVENTS_QUERY).not.toContain('SYSUTCDATETIME')
  })

  it("n'émet un évènement co-organisé qu'une fois", () => {
    // Une jointure sur EventCommunity en émettrait une ligne par rattachement correspondant.
    expect(LIST_COMMUNITY_EVENTS_QUERY).toContain('EXISTS')
    expect(LIST_COMMUNITY_EVENTS_QUERY).toContain('ORDER BY e.StartDate')
  })
})

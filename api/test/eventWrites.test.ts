import { HttpRequest, InvocationContext } from '@azure/functions'
import { describe, expect, it } from 'vitest'
import { adminEvents } from '../src/functions/adminEvents'
import { CREATE_EVENT_QUERY, mapEventOptions } from '../src/lib/eventsRepo'
import { CREATE_EVENT } from '../src/lib/eventSchemas'
import { type SessionPermissions } from '../src/lib/permissionsRepo'
import { type AuthenticatedIdentity } from '../src/lib/tokenValidation'
import { type AuthenticatedSession } from '../src/lib/withAuthorization'

const IDENTITY: AuthenticatedIdentity = {
  objectId: 'c722f670-cebf-4f94-b3b2-1723bfa372e6',
  email: 'organisateur@example.com',
  givenName: 'Amélie',
  familyName: 'Rousseau',
}

const MINE = 'C1C1C1C1-0000-0000-0000-000000000001'
const THEIRS = 'C2C2C2C2-0000-0000-0000-000000000002'
const FORMAT = 'F2F2F2F2-0000-0000-0000-000000000002'
const MODE = 'D1D1D1D1-0000-0000-0000-000000000001'

const ADMIN: SessionPermissions = { isGlobalAdmin: true, organizedCommunityIds: [] }
const ORGANIZER: SessionPermissions = { isGlobalAdmin: false, organizedCommunityIds: [MINE] }

function session(permissions: SessionPermissions): AuthenticatedSession {
  return { identity: IDENTITY, permissions }
}

/** Un corps valide, dont chaque test ne change que ce qu'il éprouve. */
function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Azure Deep Dive',
    startDate: '2026-09-10T16:30:00.000Z',
    endDate: '2026-09-10T19:00:00.000Z',
    formatTypeId: FORMAT,
    eventModeId: MODE,
    communityIds: [MINE],
    ...overrides,
  }
}

function post(payload: unknown): HttpRequest {
  return new HttpRequest({
    method: 'POST',
    url: 'https://api.example.com/api/manage/events',
    body: { string: JSON.stringify(payload) },
    headers: { 'content-type': 'application/json' },
  })
}

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
 * Comme les autres suites d'écriture, celle-ci s'arrête au refus : c'est ce que la couche HTTP
 * décide sans base. L'écriture elle-même relève du repository, dont les constantes SQL sont
 * éprouvées plus bas et dont le reste appartient à la boucle locale.
 */
describe('habilitation de la création', () => {
  it("refuse un évènement ne portant que des communautés qu'on n'organise pas", async () => {
    // Ce n'est pas une restriction de la co-organisation, c'est une question de signature :
    // publier au nom d'une communauté avec laquelle on n'a rien à voir.
    const ctx = context()
    const response = await adminEvents(
      post(body({ communityIds: [THEIRS] })),
      ctx,
      session(ORGANIZER),
    )

    expect(response.status).toBe(403)
    expect(JSON.stringify(ctx.errors)).toContain('create:event')
  })

  it('accepte une communauté tierce dès lors que la sienne est du lot', async () => {
    // C'est le mécanisme de co-organisation de #147, et il est délibérément ouvert.
    const response = await adminEvents(
      post(body({ communityIds: [MINE, THEIRS] })),
      context(),
      session(ORGANIZER),
    )

    expect(response.status).not.toBe(403)
  })

  it("refuse à un organisateur l'évènement sans aucune communauté", async () => {
    // Un évènement orphelin ne se gère plus que par un administrateur : personne d'autre ne
    // peut mettre le catalogue dans cet état.
    const response = await adminEvents(post(body({ communityIds: [] })), context(), session(ORGANIZER))

    expect(response.status).toBe(403)
  })

  it("laisse un administrateur créer sans communauté sélectionnée", async () => {
    // L'edge case de #145 : un administrateur global n'a pas nécessairement de communauté.
    const response = await adminEvents(post(body({ communityIds: [] })), context(), session(ADMIN))

    expect(response.status).not.toBe(403)
  })

  it('ne nomme aucune communauté dans le corps du refus', async () => {
    const response = await adminEvents(
      post(body({ communityIds: [THEIRS] })),
      context(),
      session(ORGANIZER),
    )

    expect(JSON.stringify(response.jsonBody)).not.toContain(THEIRS)
  })
})

describe('validation de la création', () => {
  it('refuse un titre vide', async () => {
    const response = await adminEvents(post(body({ title: '   ' })), context(), session(ADMIN))

    expect(response.status).toBe(400)
    expect(code(response)).toBe('INVALID_BODY')
  })

  it('refuse un titre plus long que la colonne, plutôt que de le tronquer', async () => {
    // `Title NVARCHAR(300)` — l'edge case de #145 veut un refus qui dise la limite.
    const response = await adminEvents(
      post(body({ title: 'A'.repeat(301) })),
      context(),
      session(ADMIN),
    )

    expect(response.status).toBe(400)
    expect(CREATE_EVENT.safeParse(body({ title: 'A'.repeat(300) })).success).toBe(true)
  })

  it('exige la date de fin', async () => {
    // Obligatoire depuis l'amendement de #145 : sans elle, #174 ne peut pas décider du passé.
    const response = await adminEvents(post(body({ endDate: undefined })), context(), session(ADMIN))

    expect(response.status).toBe(400)
  })

  it('refuse une date de fin antérieure au début', async () => {
    const response = await adminEvents(
      post(body({ endDate: '2026-09-10T15:00:00.000Z' })),
      context(),
      session(ADMIN),
    )

    expect(response.status).toBe(400)
  })

  it('accepte une fin égale au début', async () => {
    // Dégénéré mais pas incohérent, et la story ne refuse que l'antériorité.
    expect(
      CREATE_EVENT.safeParse(body({ endDate: '2026-09-10T16:30:00.000Z' })).success,
    ).toBe(true)
  })

  it("refuse une date sans fuseau, qui ne désigne aucun instant", async () => {
    // « 18:30 » n'est une heure que quelque part. Acceptée, elle serait lue en UTC et tout
    // évènement français serait décalé de deux heures en été.
    const response = await adminEvents(
      post(body({ startDate: '2026-09-10T18:30' })),
      context(),
      session(ADMIN),
    )

    expect(response.status).toBe(400)
  })

  it('refuse une clé inconnue plutôt que de la laisser sans effet', async () => {
    const response = await adminEvents(post(body({ bannerUrl: 'x' })), context(), session(ADMIN))

    expect(response.status).toBe(400)
  })

  it('rend la description vide en `null`, pour que « aucune » ne s’écrive que d’une façon', () => {
    const parsed = CREATE_EVENT.parse(body({ description: '   ' }))

    expect(parsed.description).toBeNull()
  })

  it('applique les tableaux vides par défaut', () => {
    const parsed = CREATE_EVENT.parse(body({ communityIds: undefined }))

    expect(parsed.communityIds).toEqual([])
    expect(parsed.technologyIds).toEqual([])
    expect(parsed.bannerImagePath).toBeNull()
  })

  it("valide avant d'arbitrer, sur cette route et à dessein", async () => {
    // L'habilitation se calcule *depuis* le corps : il n'y a pas de question à poser avant de
    // l'avoir lu. Un corps illisible répond donc 400, y compris à un appelant non habilité, et
    // ne confirme rien qu'un 403 aurait caché.
    const response = await adminEvents(post({ nope: true }), context(), session(ORGANIZER))

    expect(response.status).toBe(400)
  })
})

describe("écriture d'un évènement et de ses rattachements", () => {
  it('écrit les trois tables dans une seule transaction', () => {
    // Un évènement arrivé sans ses communautés ne serait rouvrable que par un administrateur —
    // exactement l'état que #147 interdit de produire.
    expect(CREATE_EVENT_QUERY).toContain('SET XACT_ABORT ON')
    expect(CREATE_EVENT_QUERY).toContain('BEGIN TRANSACTION')
    expect(CREATE_EVENT_QUERY).toContain('COMMIT TRANSACTION')
    expect(CREATE_EVENT_QUERY).toContain('dbo.EventCommunity')
    expect(CREATE_EVENT_QUERY).toContain('dbo.EventTechnology')
  })

  it('lit les listes d’identifiants en paramètre, jamais concaténées', () => {
    expect(CREATE_EVENT_QUERY).toContain('OPENJSON(@communityIds)')
    expect(CREATE_EVENT_QUERY).toContain('OPENJSON(@technologyIds)')
    // Les clés primaires composites refuseraient un doublon ; un formulaire qui envoie deux
    // fois la même communauté a fait une erreur sans conséquence, pas une requête à refuser.
    expect(CREATE_EVENT_QUERY).toContain('SELECT DISTINCT')
  })
})

describe('vocabulaires fermés', () => {
  it('sépare les deux jeux de résultats', () => {
    const options = mapEventOptions([
      [{ Id: FORMAT, Name: 'Meetup' }],
      [{ Id: MODE, Name: 'Présentiel' }],
    ])

    expect(options.formats).toEqual([{ id: FORMAT, name: 'Meetup' }])
    expect(options.modes).toEqual([{ id: MODE, name: 'Présentiel' }])
  })

  it('rend deux listes vides plutôt que de lever quand rien ne revient', () => {
    expect(mapEventOptions([])).toEqual({ formats: [], modes: [] })
  })
})

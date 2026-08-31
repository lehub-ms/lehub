import { HttpRequest, InvocationContext } from '@azure/functions'
import { describe, expect, it } from 'vitest'
import { eventHandler } from '../src/functions/adminEvent'
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

const STORED = {
  id: 'E1E1E1E1-0000-0000-0000-000000000001',
  title: 'Azure Deep Dive',
  description: null,
  startDate: '2026-09-10T16:30:00.000Z',
  endDate: '2026-09-10T19:00:00.000Z',
  bannerImagePath: null,
  bannerImageUrl: null,
  formatTypeId: FORMAT,
  format: 'Meetup',
  eventModeId: MODE,
  mode: 'Présentiel',
  // Porté par une seule communauté, celle que `ORGANIZER` organise.
  communities: [{ id: MINE, name: 'AZUG', logoUrl: null, archived: false }],
  technologies: [],
}

/** Le lecteur et l'écrivain sont des paramètres : la couche s'éprouve sans base. */
function handler(stored: typeof STORED | null = STORED) {
  const written: unknown[] = []
  const route = eventHandler(
    () => Promise.resolve(stored),
    (id, patch) => {
      written.push({ id, patch })
      return Promise.resolve({ ok: true, event: { ...STORED, ...patch } })
    },
  )
  return { route, written }
}

function request(method: 'GET' | 'PATCH', payload?: unknown, eventId = STORED.id): HttpRequest {
  return new HttpRequest({
    method,
    url: `https://api.example.com/api/manage/events/${eventId}`,
    params: { eventId },
    ...(payload === undefined
      ? { headers: {} }
      : { body: { string: JSON.stringify(payload) }, headers: { 'content-type': 'application/json' } }),
  })
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

describe('lecture et modification d’un évènement', () => {
  it("refuse la lecture à qui n'organise aucune de ses communautés", async () => {
    const ctx = context()
    const { route } = handler()
    const response = await route(request('GET'), ctx, session({ isGlobalAdmin: false, organizedCommunityIds: [THEIRS] }))

    expect(response.status).toBe(403)
    expect(JSON.stringify(ctx.errors)).toContain('read:event')
  })

  it('ouvre la lecture à un organisateur de la communauté portée', async () => {
    const { route } = handler()
    const response = await route(request('GET'), context(), session(ORGANIZER))

    expect(response.status).toBe(200)
    expect((response.jsonBody as { id: string }).id).toBe(STORED.id)
  })

  it('répond 404 sur un identifiant qui ne correspond à rien', async () => {
    const { route } = handler(null)
    const response = await route(request('GET'), context(), session(ORGANIZER))

    expect(response.status).toBe(404)
    expect(code(response)).toBe('EVENT_NOT_FOUND')
  })

  it('répond 400 sur un identifiant malformé, sans toucher au pilote', async () => {
    const { route } = handler()
    const response = await route(request('GET', undefined, 'pas-un-guid'), context(), session(ORGANIZER))

    expect(response.status).toBe(400)
    expect(code(response)).toBe('INVALID_ROUTE_PARAMETER')
  })

  it('refuse une fin ramenée avant le début **stocké**, pas seulement avant celui du corps', async () => {
    // Le patch ne porte qu'une date ; l'autre est en base. Une vérification sur le seul corps
    // laisserait passer ce cas à tous les coups.
    const { route, written } = handler()
    const response = await route(
      request('PATCH', { endDate: '2026-09-10T15:00:00.000Z' }),
      context(),
      session(ORGANIZER),
    )

    expect(response.status).toBe(400)
    expect(code(response)).toBe('INVALID_DATE_RANGE')
    expect(written).toHaveLength(0)
  })

  it('accepte un patch qui ne porte qu’un titre', async () => {
    const { route, written } = handler()
    const response = await route(request('PATCH', { title: 'Nouveau titre' }), context(), session(ORGANIZER))

    expect(response.status).toBe(200)
    expect(written).toEqual([{ id: STORED.id, patch: { title: 'Nouveau titre' } }])
  })

  it('refuse un patch vide', async () => {
    const { route } = handler()
    const response = await route(request('PATCH', {}), context(), session(ORGANIZER))

    expect(response.status).toBe(400)
    expect(code(response)).toBe('INVALID_BODY')
  })

})

/**
 * L'asymétrie de la co-organisation (#147) : rattacher est ouvert, retirer est borné.
 *
 * Toute cette suite passe par la route, et non par `canDetachCommunity` seul — c'est le calcul
 * de la différence entre l'ensemble stocké et l'ensemble soumis qui décide de ce qui est un
 * retrait, et c'est lui qu'une écriture forgée essaie de contourner.
 */
describe('rattachement et retrait des communautés', () => {
  const THIRD = 'C3C3C3C3-0000-0000-0000-000000000003'

  /** Un évènement porté par les communautés données. */
  function carrying(...communityIds: string[]) {
    return {
      ...STORED,
      communities: communityIds.map((id) => ({ id, name: id, logoUrl: null, archived: false })),
    }
  }

  function patchWith(stored: typeof STORED, permissions: SessionPermissions, communityIds: string[]) {
    const written: unknown[] = []
    const route = eventHandler(
      () => Promise.resolve(stored),
      (id, patch) => {
        written.push({ id, patch })
        return Promise.resolve({ ok: true, event: { ...stored, ...patch } })
      },
    )
    return {
      written,
      response: route(request('PATCH', { communityIds }), context(), session(permissions)),
    }
  }

  it("laisse rattacher n'importe quelle communauté active, même non organisée", async () => {
    // C'est ainsi qu'une soirée commune se monte sans passer par un administrateur, et
    // l'ouverture est délibérée : rien n'examine les arrivées.
    const { response, written } = patchWith(carrying(MINE), ORGANIZER, [MINE, THEIRS])

    expect((await response).status).toBe(200)
    expect(written).toHaveLength(1)
  })

  it("refuse le retrait d'une communauté tierce", async () => {
    // Évincer un co-organisateur est réservé aux administrateurs.
    const { response, written } = patchWith(carrying(MINE, THEIRS), ORGANIZER, [MINE])

    expect((await response).status).toBe(403)
    expect(written).toHaveLength(0)
  })

  it("refuse de laisser l'évènement sans aucune communauté", async () => {
    // Un évènement orphelin ne se gère plus que par un administrateur.
    const { response } = patchWith(carrying(MINE), ORGANIZER, [])

    expect((await response).status).toBe(403)
  })

  it("refuse de retirer *toutes* ses communautés d'un coup", async () => {
    // La faille que les contrôles au cas par cas ne voient pas : chacun des deux retraits
    // passe seul — l'autre demeure dans l'ensemble stocké — et le résultat est pourtant vide.
    const both: SessionPermissions = { isGlobalAdmin: false, organizedCommunityIds: [MINE, THEIRS] }
    const { response, written } = patchWith(carrying(MINE, THEIRS), both, [])

    expect((await response).status).toBe(403)
    expect(written).toHaveLength(0)
  })

  it('permet le passage de main : retirer la sienne quand une autre demeure', async () => {
    // Permis, et l'écran prévient qu'on perdra l'accès à l'évènement.
    const { response } = patchWith(carrying(MINE, THEIRS), ORGANIZER, [THEIRS])

    expect((await response).status).toBe(200)
  })

  it("n'est déjoué ni par la casse ni par l'ordre", async () => {
    // Les identifiants arrivent d'un corps de requête : aucun client n'est tenu de rendre la
    // casse qu'on lui a donnée. Comparés brutalement, ces deux-là passeraient pour un retrait
    // suivi d'un rattachement, et le retrait serait refusé à tort.
    const { response } = patchWith(carrying(MINE, THEIRS), ORGANIZER, [
      THEIRS.toLowerCase(),
      MINE.toLowerCase(),
    ])

    expect((await response).status).toBe(200)
  })

  it("n'oppose aucune de ces règles à un administrateur", async () => {
    const admin = patchWith(carrying(MINE, THEIRS), ADMIN, [])
    expect((await admin.response).status).toBe(200)

    const evicting = patchWith(carrying(MINE, THEIRS), ADMIN, [THIRD])
    expect((await evicting.response).status).toBe(200)
  })

  it('journalise le refus comme un évènement d’autorisation', async () => {
    const ctx = context()
    const route = eventHandler(
      () => Promise.resolve(carrying(MINE, THEIRS)),
      () => Promise.resolve({ ok: true, event: STORED }),
    )
    await route(request('PATCH', { communityIds: [MINE] }), ctx, session(ORGANIZER))

    expect(JSON.stringify(ctx.errors)).toContain('detach:community')
  })

  it('laisse les technologies libres de toute règle de retrait', async () => {
    // Rattacher une technologie ne donne la main à personne : il n'y a rien à borner.
    const written: unknown[] = []
    const route = eventHandler(
      () => Promise.resolve(carrying(MINE)),
      (id, patch) => {
        written.push(patch)
        return Promise.resolve({ ok: true, event: STORED })
      },
    )
    const response = await route(request('PATCH', { technologyIds: [] }), context(), session(ORGANIZER))

    expect(response.status).toBe(200)
    expect(written).toEqual([{ technologyIds: [] }])
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

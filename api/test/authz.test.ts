import { HttpRequest, InvocationContext } from '@azure/functions'
import { describe, expect, it } from 'vitest'
import {
  canCreateEvent,
  canDesignateOrganizer,
  canDetachCommunity,
  canManageGlobalAdmins,
  canWriteEvent,
  canWriteReferenceData,
  organizes,
} from '../src/lib/authz'
import { forbidden } from '../src/lib/httpErrors'
import { type SessionPermissions } from '../src/lib/permissionsRepo'
import { type AuthenticatedIdentity } from '../src/lib/tokenValidation'
import { authorized } from '../src/lib/withAuthorization'

/** Les trois niveaux d'habilitation, et le quatrième cas : administrateur *et* organisateur. */
const ANONYMOUS_USER: SessionPermissions = { isGlobalAdmin: false, organizedCommunityIds: [] }
const ORGANIZER: SessionPermissions = { isGlobalAdmin: false, organizedCommunityIds: ['c1'] }
const MULTI_ORGANIZER: SessionPermissions = { isGlobalAdmin: false, organizedCommunityIds: ['c1', 'c2'] }
const ADMIN: SessionPermissions = { isGlobalAdmin: true, organizedCommunityIds: [] }
const ADMIN_ORGANIZER: SessionPermissions = { isGlobalAdmin: true, organizedCommunityIds: ['c1'] }

describe('organizes', () => {
  it('ne reconnaît que les communautés effectivement désignées', () => {
    expect(organizes(ORGANIZER, 'c1')).toBe(true)
    expect(organizes(ORGANIZER, 'c2')).toBe(false)
    expect(organizes(ANONYMOUS_USER, 'c1')).toBe(false)
  })

  it("ne se déduit pas de la qualité d'administrateur", () => {
    // Un administrateur écrit partout, mais il n'est pas organisateur pour autant : les
    // deux qualités coexistent sans que l'une masque l'autre.
    expect(organizes(ADMIN, 'c1')).toBe(false)
  })
})

describe('comparaison des identifiants', () => {
  const UPPER: SessionPermissions = {
    isGlobalAdmin: false,
    organizedCommunityIds: ['C1C1C1C1-0000-0000-0000-000000000001'],
  }
  const lower = 'c1c1c1c1-0000-0000-0000-000000000001'

  it('reconnaît la même communauté quelle que soit la casse', () => {
    // Les identifiants sur lesquels ces prédicats seront interrogés viendront d'un corps de
    // requête — un formulaire soumis (#143), un curl, le serveur MCP (#135) — et rien
    // n'oblige un client à renvoyer la casse qu'on lui a donnée. Un échec de comparaison
    // ferme la porte en silence : l'organisateur reçoit un 403 sur sa propre communauté.
    expect(organizes(UPPER, lower)).toBe(true)
    expect(canWriteEvent(UPPER, [lower])).toBe(true)
    expect(canCreateEvent(UPPER, [lower])).toBe(true)
    expect(canDesignateOrganizer(UPPER, lower)).toBe(true)
  })

  it('reste insensible à la casse jusque dans le retrait', () => {
    expect(canDetachCommunity(UPPER, [lower, 'C9'], lower)).toBe(true)
    // La dernière communauté reste la dernière, même écrite autrement.
    expect(canDetachCommunity(UPPER, ['C1C1C1C1-0000-0000-0000-000000000001'], lower)).toBe(false)
  })

  it('ne confond pas deux identifiants différents', () => {
    expect(organizes(UPPER, 'c2c2c2c2-0000-0000-0000-000000000002')).toBe(false)
  })
})

describe('canWriteReferenceData', () => {
  it('réserve les technologies et les communautés aux administrateurs', () => {
    // Ces référentiels sont partagés : une correction faite par l'organisateur d'une
    // communauté atterrirait sur les évènements de toutes les autres.
    expect(canWriteReferenceData(ADMIN)).toBe(true)
    expect(canWriteReferenceData(ADMIN_ORGANIZER)).toBe(true)
    expect(canWriteReferenceData(ORGANIZER)).toBe(false)
    expect(canWriteReferenceData(ANONYMOUS_USER)).toBe(false)
  })
})

describe('canWriteEvent', () => {
  it("autorise l'organisateur d'une des communautés portées", () => {
    expect(canWriteEvent(ORGANIZER, ['c1'])).toBe(true)
    // Co-organisation : une seule communauté organisée suffit sur un évènement qui en
    // porte plusieurs.
    expect(canWriteEvent(ORGANIZER, ['c1', 'c9'])).toBe(true)
  })

  it("refuse l'organisateur d'une communauté étrangère à l'évènement", () => {
    expect(canWriteEvent(ORGANIZER, ['c9'])).toBe(false)
    expect(canWriteEvent(ANONYMOUS_USER, ['c1'])).toBe(false)
  })

  it("réserve l'évènement sans aucune communauté aux administrateurs", () => {
    expect(canWriteEvent(ADMIN, [])).toBe(true)
    expect(canWriteEvent(ORGANIZER, [])).toBe(false)
    expect(canWriteEvent(MULTI_ORGANIZER, [])).toBe(false)
  })

  it('autorise un administrateur sur toute communauté', () => {
    expect(canWriteEvent(ADMIN, ['c9'])).toBe(true)
  })
})

describe('canCreateEvent', () => {
  it("exige au moins une communauté organisée par l'appelant", () => {
    // Ce n'est pas une restriction du partage : c'est la signature. Créer un évènement ne
    // portant que des communautés tierces reviendrait à publier en leur nom.
    expect(canCreateEvent(ORGANIZER, ['c1'])).toBe(true)
    expect(canCreateEvent(ORGANIZER, ['c9'])).toBe(false)
  })

  it('laisse rattacher des communautés que l’appelant n’organise pas', () => {
    // Le rattachement est ouvert — c'est ainsi qu'une soirée commune se monte sans passer
    // par un administrateur.
    expect(canCreateEvent(ORGANIZER, ['c1', 'c9'])).toBe(true)
  })

  it('refuse la création sans communauté à un non-administrateur', () => {
    expect(canCreateEvent(ORGANIZER, [])).toBe(false)
    expect(canCreateEvent(ADMIN, [])).toBe(true)
  })
})

describe('canDetachCommunity', () => {
  it("laisse l'organisateur retirer sa propre communauté quand une autre demeure", () => {
    // Passer la main : permis, l'interface prévenant qu'on perdra l'accès à l'évènement.
    expect(canDetachCommunity(ORGANIZER, ['c1', 'c9'], 'c1')).toBe(true)
  })

  it("refuse de retirer la communauté d'un co-organisateur", () => {
    // Ce serait évincer quelqu'un d'un évènement qu'il gère. Réservé aux administrateurs.
    expect(canDetachCommunity(ORGANIZER, ['c1', 'c9'], 'c9')).toBe(false)
    expect(canDetachCommunity(ADMIN, ['c1', 'c9'], 'c9')).toBe(true)
  })

  it("refuse de laisser l'évènement sans aucune communauté", () => {
    // Un évènement orphelin ne se gère plus que par un administrateur : aucun organisateur
    // ne peut le mettre dans cet état.
    expect(canDetachCommunity(ORGANIZER, ['c1'], 'c1')).toBe(false)
    expect(canDetachCommunity(MULTI_ORGANIZER, ['c1'], 'c1')).toBe(false)
    // L'administrateur, lui, le peut.
    expect(canDetachCommunity(ADMIN, ['c1'], 'c1')).toBe(true)
  })

  it("laisse l'organisateur des deux communautés en retirer une, pas les deux", () => {
    expect(canDetachCommunity(MULTI_ORGANIZER, ['c1', 'c2'], 'c1')).toBe(true)
    expect(canDetachCommunity(MULTI_ORGANIZER, ['c2'], 'c2')).toBe(false)
  })

  it("refuse de retirer une communauté qui n'est pas rattachée", () => {
    expect(canDetachCommunity(ORGANIZER, ['c9'], 'c1')).toBe(false)
  })
})

describe('canDesignateOrganizer', () => {
  it("laisse l'organisateur coopter sur ses communautés, et nulle part ailleurs", () => {
    expect(canDesignateOrganizer(ORGANIZER, 'c1')).toBe(true)
    expect(canDesignateOrganizer(ORGANIZER, 'c9')).toBe(false)
  })

  it('laisse un administrateur désigner sur toute communauté', () => {
    expect(canDesignateOrganizer(ADMIN, 'c9')).toBe(true)
  })

  it('refuse un utilisateur ordinaire', () => {
    expect(canDesignateOrganizer(ANONYMOUS_USER, 'c1')).toBe(false)
  })
})

describe('canManageGlobalAdmins', () => {
  it("n'ouvre le marqueur d'administrateur qu'aux administrateurs", () => {
    // La seule habilitation qu'un organisateur peut accorder est celle d'organisateur.
    // Personne ne s'octroie la qualité d'administrateur global.
    expect(canManageGlobalAdmins(ADMIN)).toBe(true)
    expect(canManageGlobalAdmins(ORGANIZER)).toBe(false)
    expect(canManageGlobalAdmins(MULTI_ORGANIZER)).toBe(false)
    expect(canManageGlobalAdmins(ANONYMOUS_USER)).toBe(false)
  })
})

/**
 * Les prédicats ci-dessus sont purs ; ce bloc démontre que leur refus sort réellement de la
 * chaîne HTTP — un 403 distinct du 401, muet sur la ressource, et journalisé. Sans lui, rien
 * ne prouverait la chaîne avant la première route d'écriture (#143, #150, #156).
 */
describe('refus au travers de la chaîne HTTP', () => {
  const IDENTITY: AuthenticatedIdentity = {
    objectId: 'c722f670-cebf-4f94-b3b2-1723bfa372e6',
    email: 'organisateur@example.com',
    givenName: 'Amélie',
    familyName: 'Rousseau',
  }

  function context(): InvocationContext & { errors: unknown[][] } {
    const errors: unknown[][] = []
    const ctx = new InvocationContext({ functionName: 'test' }) as InvocationContext & { errors: unknown[][] }
    ctx.error = (...args: unknown[]) => void errors.push(args)
    ctx.errors = errors
    return ctx
  }

  /** Une route d'écriture sur le référentiel, telle que #150 l'écrira. */
  const route = authorized(
    async (request, ctx, session) =>
      canWriteReferenceData(session.permissions)
        ? { status: 204 }
        : forbidden(ctx, {
            route: `${request.method} ${new URL(request.url).pathname}`,
            action: 'technology.update',
            objectId: session.identity.objectId,
          }),
    async () => ORGANIZER,
  )

  const request = (): HttpRequest =>
    new HttpRequest({ method: 'PATCH', url: 'https://api.example.com/api/technologies/t1' })

  it('répond 403, et non 401 : se reconnecter n’y changerait rien', async () => {
    const response = await route(request(), context(), IDENTITY)
    expect(response.status).toBe(403)
    expect(response.jsonBody).toMatchObject({ code: 'FORBIDDEN' })
  })

  it("ne révèle pas l'existence de la ressource visée", async () => {
    const response = await route(request(), context(), IDENTITY)
    const body = JSON.stringify(response.jsonBody)
    expect(body).not.toContain('t1')
    expect(body).not.toContain('technolog')
  })

  it("journalise la route, l'action et l'appelant — sans jeton ni claim", async () => {
    const ctx = context()
    await route(request(), ctx, IDENTITY)

    expect(ctx.errors).toHaveLength(1)
    const logged = JSON.stringify(ctx.errors)
    expect(logged).toContain('PATCH /api/technologies/t1')
    expect(logged).toContain('technology.update')
    expect(logged).toContain(IDENTITY.objectId)
    expect(logged).not.toContain(IDENTITY.email)
    expect(logged).not.toContain('Bearer')
  })

  it('laisse passer un appelant habilité, sans rien journaliser', async () => {
    const allowed = authorized(
      async (_req, _ctx, session) => ({ status: canWriteReferenceData(session.permissions) ? 204 : 403 }),
      async () => ADMIN,
    )
    const ctx = context()

    expect((await allowed(request(), ctx, IDENTITY)).status).toBe(204)
    expect(ctx.errors).toHaveLength(0)
  })
})

import { HttpRequest, InvocationContext } from '@azure/functions'
import { describe, expect, it } from 'vitest'
import { communityOrganizers } from '../src/functions/communityOrganizers'
import { canDesignateOrganizer } from '../src/lib/authz'
import {
  DESIGNATE_ORGANIZER_QUERY,
  LIST_ORGANIZERS_QUERY,
  REMOVE_ORGANIZER_QUERY,
} from '../src/lib/organizersRepo'
import { type SessionPermissions } from '../src/lib/permissionsRepo'
import { type AuthenticatedIdentity } from '../src/lib/tokenValidation'
import { type AuthenticatedSession } from '../src/lib/withAuthorization'

const MINE = 'C1C1C1C1-0000-0000-0000-000000000001'
const THEIRS = 'C2C2C2C2-0000-0000-0000-000000000002'

const IDENTITY: AuthenticatedIdentity = {
  objectId: 'c722f670-cebf-4f94-b3b2-1723bfa372e6',
  email: 'organisateur@example.com',
  givenName: 'Amélie',
  familyName: 'Rousseau',
}

const ADMIN: SessionPermissions = { isGlobalAdmin: true, organizedCommunityIds: [] }
// Volontairement en minuscules là où la route reçoit des majuscules : SQL Server rend ses
// UNIQUEIDENTIFIER en majuscules, un corps de requête n'a aucune obligation de les recopier, et
// une comparaison sensible à la casse refuserait un organisateur sur sa propre communauté.
const ORGANIZER: SessionPermissions = {
  isGlobalAdmin: false,
  organizedCommunityIds: [MINE.toLowerCase()],
}
const ORDINARY: SessionPermissions = { isGlobalAdmin: false, organizedCommunityIds: [] }

function session(permissions: SessionPermissions): AuthenticatedSession {
  return { identity: IDENTITY, permissions }
}

function call(method: string, communityId: string, body?: unknown): HttpRequest {
  return new HttpRequest({
    method,
    url: `https://api.example.com/api/manage/communities/${communityId}/organizers`,
    params: { communityId },
    ...(body === undefined
      ? {}
      : {
          body: { string: JSON.stringify(body) },
          headers: { 'content-type': 'application/json' },
        }),
  })
}

/** Capture les appels à context.error sans dépendre du hôte Functions. */
function context(): InvocationContext & { errors: unknown[][] } {
  const errors: unknown[][] = []
  const ctx = new InvocationContext({ functionName: 'test' }) as InvocationContext & {
    errors: unknown[][]
  }
  ctx.error = (...args: unknown[]) => void errors.push(args)
  ctx.errors = errors
  return ctx
}

describe('matrice de la désignation d’organisateurs', () => {
  it('laisse un organisateur coopter sur ses communautés, et sur aucune autre', () => {
    // La seule habilitation qu'un organisateur peut accorder — c'est ce qui évite que le
    // mainteneur soit le passage obligé de toute équipe qui s'étoffe (Epic #88).
    expect(canDesignateOrganizer(ORGANIZER, MINE)).toBe(true)
    expect(canDesignateOrganizer(ORGANIZER, THEIRS)).toBe(false)
    expect(canDesignateOrganizer(ORDINARY, MINE)).toBe(false)
  })

  it('laisse un administrateur global désigner sur n’importe quelle communauté', () => {
    expect(canDesignateOrganizer(ADMIN, MINE)).toBe(true)
    expect(canDesignateOrganizer(ADMIN, THEIRS)).toBe(true)
  })
})

describe('refus des écritures hors périmètre', () => {
  for (const [verb, body] of [
    ['GET', undefined],
    ['POST', { email: 'renfort@lehub.invalid' }],
    ['DELETE', { email: 'renfort@lehub.invalid' }],
  ] as const) {
    it(`refuse ${verb} sur une communauté qu’on n’organise pas, en 403 journalisé`, async () => {
      // La requête est forgée : l'écran n'aurait proposé aucun bouton, et c'est précisément ce
      // que ce test démontre — l'interface n'a jamais protégé quoi que ce soit.
      const ctx = context()
      const response = await communityOrganizers(
        call(verb, THEIRS, body),
        ctx,
        session(ORGANIZER),
      )

      expect(response.status).toBe(403)
      expect((response.jsonBody as { code: string }).code).toBe('FORBIDDEN')

      const logged = JSON.stringify(ctx.errors)
      expect(logged).toContain('Authorization refused')
      expect(logged).toContain(IDENTITY.objectId)
      // Le journal identifie l'appelant, il ne le décrit pas.
      expect(logged).not.toContain(IDENTITY.email)
    })
  }

  it('journalise l’action refusée, distincte selon le verbe', async () => {
    for (const [verb, body, action] of [
      ['GET', undefined, 'read:organizers'],
      ['POST', { email: 'a@b.fr' }, 'designate:organizer'],
      ['DELETE', { email: 'a@b.fr' }, 'remove:organizer'],
    ] as const) {
      const ctx = context()
      await communityOrganizers(call(verb, THEIRS, body), ctx, session(ORGANIZER))

      expect(JSON.stringify(ctx.errors)).toContain(action)
    }
  })

  it('refuse avant de regarder le corps, valide ou non', async () => {
    const bad = await communityOrganizers(
      call('POST', THEIRS, { email: 'pas une adresse' }),
      context(),
      session(ORGANIZER),
    )
    const good = await communityOrganizers(
      call('POST', THEIRS, { email: 'renfort@lehub.invalid' }),
      context(),
      session(ORGANIZER),
    )

    expect(bad.status).toBe(403)
    expect(good.status).toBe(403)
  })

  it('refuse un identifiant de communauté malformé en 400, jamais en 403', async () => {
    // Un lien cassé n'est pas un refus d'habilitation, et un identifiant mal formé qui
    // atteindrait `organizes` ne correspondrait à rien et se lirait comme un défaut de droits.
    const response = await communityOrganizers(
      call('GET', 'pas-un-guid'),
      context(),
      session(ADMIN),
    )

    expect(response.status).toBe(400)
    expect((response.jsonBody as { code: string }).code).toBe('INVALID_ROUTE_PARAMETER')
  })
})

describe('validation du corps de désignation', () => {
  for (const body of [{}, { email: '' }, { email: 'pas une adresse' }, { email: 'a@b.fr', role: 'x' }]) {
    it(`refuse ${JSON.stringify(body)} en 400`, async () => {
      const response = await communityOrganizers(
        call('POST', MINE, body),
        context(),
        session(ADMIN),
      )

      expect(response.status).toBe(400)
      expect((response.jsonBody as { code: string }).code).toBe('INVALID_BODY')
    })
  }

  it('laisse passer un organisateur légitime — au-delà, c’est la base qui répond', async () => {
    // Sans serveur SQL la suite s'arrête ici. Ce qui compte est que le garde ait rendu la main
    // sur la communauté que cet organisateur organise, malgré la casse différente.
    const response = await communityOrganizers(
      call('POST', MINE, { email: 'renfort@lehub.invalid' }),
      context(),
      session(ORGANIZER),
    )

    expect(response.status).not.toBe(403)
    expect(response.status).not.toBe(400)
  })
})

describe('requêtes SQL des désignations', () => {
  it('ne lit que le prénom, le nom et l’adresse des organisateurs', () => {
    expect(LIST_ORGANIZERS_QUERY).toContain('u.GivenName, u.Surname, u.Email')
    expect(LIST_ORGANIZERS_QUERY).not.toContain('ExternalIdObjectId,')
    expect(LIST_ORGANIZERS_QUERY).not.toContain('IsGlobalAdmin')
    expect(LIST_ORGANIZERS_QUERY).not.toContain('DesignatedAt')
  })

  it('capture @@ROWCOUNT immédiatement après l’INSERT', () => {
    // Toute instruction le réinitialise : un SELECT intercalé ferait passer « déjà désigné »
    // pour un succès, à chaque fois.
    const afterInsert = DESIGNATE_ORGANIZER_QUERY.slice(
      DESIGNATE_ORGANIZER_QUERY.indexOf('WHERE NOT EXISTS'),
    )
    const rowCount = afterInsert.indexOf('@@ROWCOUNT')
    const nextSelect = afterInsert.indexOf('SELECT', afterInsert.indexOf(');'))

    expect(rowCount).toBeGreaterThan(-1)
    expect(rowCount).toBeLessThan(nextSelect)
  })

  it('n’insère pas deux fois la même désignation, et trace qui a désigné', () => {
    expect(DESIGNATE_ORGANIZER_QUERY).toContain('WHERE NOT EXISTS')
    expect(DESIGNATE_ORGANIZER_QUERY).toContain('@designatedBy')
  })

  it('distingue le compte inconnu de la communauté inconnue', () => {
    expect(DESIGNATE_ORGANIZER_QUERY).toContain("'account-not-found'")
    expect(DESIGNATE_ORGANIZER_QUERY).toContain("'community-not-found'")
  })

  it('retire par jointure sur l’adresse, sans condition de dernier organisateur', () => {
    // Retirer le dernier organisateur est permis : la communauté reste gérable par les
    // administrateurs globaux. Un garde-fou ici serait un défaut, pas une sécurité.
    expect(REMOVE_ORGANIZER_QUERY).toContain('INNER JOIN dbo.[User]')
    expect(REMOVE_ORGANIZER_QUERY).toContain('o.CommunityId = @communityId AND u.Email = @email')
    expect(REMOVE_ORGANIZER_QUERY).not.toContain('COUNT')
  })
})

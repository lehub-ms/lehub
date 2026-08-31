import { HttpRequest, InvocationContext } from '@azure/functions'
import { describe, expect, it } from 'vitest'
import { adminCommunities } from '../src/functions/adminCommunities'
import { adminCommunity } from '../src/functions/adminCommunity'
import { adminTechnologies } from '../src/functions/adminTechnologies'
import { adminTechnology } from '../src/functions/adminTechnology'
import { CREATE_COMMUNITY_QUERY, DELETE_COMMUNITY_QUERY } from '../src/lib/communitiesRepo'
import { CREATE_TECHNOLOGY_QUERY, DELETE_TECHNOLOGY_QUERY } from '../src/lib/technologiesRepo'
import { isForeignKeyViolation, isUniqueViolation } from '../src/lib/sqlErrors'
import { type SessionPermissions } from '../src/lib/permissionsRepo'
import { type AuthenticatedIdentity } from '../src/lib/tokenValidation'
import { type AuthenticatedSession } from '../src/lib/withAuthorization'

const IDENTITY: AuthenticatedIdentity = {
  objectId: 'c722f670-cebf-4f94-b3b2-1723bfa372e6',
  email: 'admin@example.com',
  givenName: 'Amélie',
  familyName: 'Rousseau',
}

const ADMIN: SessionPermissions = { isGlobalAdmin: true, organizedCommunityIds: [] }
const ORGANIZER: SessionPermissions = {
  isGlobalAdmin: false,
  organizedCommunityIds: ['C1C1C1C1-0000-0000-0000-000000000001'],
}

const ID = 'C1C1C1C1-0000-0000-0000-000000000001'

function session(permissions: SessionPermissions): AuthenticatedSession {
  return { identity: IDENTITY, permissions }
}

function write(
  method: 'POST' | 'PATCH',
  path: string,
  body: unknown,
  params: Record<string, string> = {},
): HttpRequest {
  return new HttpRequest({
    method,
    url: `https://api.example.com/api/${path}`,
    params,
    body: { string: JSON.stringify(body) },
    headers: { 'content-type': 'application/json' },
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

function code(response: { jsonBody?: unknown }): string {
  return (response.jsonBody as { code: string }).code
}

/**
 * Ces suites s'arrêtent au refus, qui est ce que cette couche décide sans base. Ce qui suit —
 * l'écriture elle-même — relève du repository, dont les parties pures sont testées ailleurs, et
 * de la boucle locale.
 */
describe('habilitation des écritures', () => {
  const cases = [
    ['POST', 'admin/communities', adminCommunities, 'create:community'],
    ['POST', 'admin/technologies', adminTechnologies, 'create:technology'],
  ] as const

  for (const [method, path, handler, action] of cases) {
    it(`refuse ${method} ${path} à un non-administrateur, et le journalise`, async () => {
      const ctx = context()
      const response = await handler(
        write(method, path, { name: 'Azure' }),
        ctx,
        session(ORGANIZER),
      )

      expect(response.status).toBe(403)
      expect(JSON.stringify(ctx.errors)).toContain(action)
    })
  }

  it('refuse aussi la modification, et sans regarder le corps', async () => {
    // Le 403 tombe avant la validation : sinon un appelant non habilité distinguerait « ma
    // charge utile était fausse » de « je n'ai pas le droit », ce qui est un canal
    // d'énumération. Le corps ci-dessous est volontairement invalide.
    const response = await adminCommunity(
      write('PATCH', `admin/communities/${ID}`, { nope: true }, { communityId: ID }),
      context(),
      session(ORGANIZER),
    )

    expect(response.status).toBe(403)
  })
})

describe('validation des écritures', () => {
  it('refuse un corps sans nom à la création', async () => {
    const response = await adminCommunities(
      write('POST', 'admin/communities', { description: 'sans nom' }),
      context(),
      session(ADMIN),
    )

    expect(response.status).toBe(400)
    expect(code(response)).toBe('INVALID_BODY')
  })

  it('refuse une description plus longue que la colonne, plutôt que de la tronquer', async () => {
    const response = await adminCommunities(
      write('POST', 'admin/communities', { name: 'A', description: 'd'.repeat(301) }),
      context(),
      session(ADMIN),
    )

    expect(response.status).toBe(400)
  })

  it('refuse une modification vide', async () => {
    const response = await adminCommunity(
      write('PATCH', `admin/communities/${ID}`, {}, { communityId: ID }),
      context(),
      session(ADMIN),
    )

    expect(response.status).toBe(400)
  })

  it('refuse une description sur une technologie, qui n’en porte pas', async () => {
    const response = await adminTechnologies(
      write('POST', 'admin/technologies', { name: 'Azure', description: 'x' }),
      context(),
      session(ADMIN),
    )

    expect(response.status).toBe(400)
  })

  it('refuse un identifiant de chemin malformé avant toute requête', async () => {
    const response = await adminTechnology(
      write('PATCH', 'admin/technologies/pas-un-guid', { name: 'A' }, {
        technologyId: 'pas-un-guid',
      }),
      context(),
      session(ADMIN),
    )

    expect(response.status).toBe(400)
    expect(code(response)).toBe('INVALID_ROUTE_PARAMETER')
  })
})

describe('requêtes d’écriture', () => {
  it('nomme les colonnes explicitement à l’insertion, statut compris', () => {
    // Sans Status dans la liste, une entrée créée depuis le backoffice prendrait le défaut de la
    // colonne — ce qui marcherait, mais rendrait le panneau incapable d'en créer une archivée.
    expect(CREATE_COMMUNITY_QUERY).toContain('(Name, Slug, Description, LogoPath, Status)')
    expect(CREATE_TECHNOLOGY_QUERY).toContain('(Name, LogoPath, Status)')
  })

  it('rend la ligne d’administration créée, compteurs compris, en un aller-retour', () => {
    expect(CREATE_COMMUNITY_QUERY).toContain('AS OrganizerCount')
    expect(CREATE_COMMUNITY_QUERY).toContain('AS EventCount')
  })
})

describe('verdicts de la base', () => {
  it('reconnaît une violation d’unicité sur ses deux codes', () => {
    expect(isUniqueViolation({ number: 2601 })).toBe(true)
    expect(isUniqueViolation({ number: 2627 })).toBe(true)
    expect(isUniqueViolation({ number: 547 })).toBe(false)
    expect(isUniqueViolation(new Error('boom'))).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
  })

  it('reconnaît une violation de clé étrangère, et ne la confond pas avec l’unicité', () => {
    expect(isForeignKeyViolation({ number: 547 })).toBe(true)
    expect(isForeignKeyViolation({ number: 2627 })).toBe(false)
  })
})

describe('suppression', () => {
  it('compte, puis supprime sous condition — la course est fermée côté base', () => {
    // Entre le comptage et le DELETE, un évènement peut être rattaché. La condition sur le
    // DELETE ferme cette fenêtre, et l'erreur 547 la ferme une seconde fois si la contrainte
    // tranche la première.
    expect(DELETE_COMMUNITY_QUERY).toContain('NOT EXISTS')
    expect(DELETE_COMMUNITY_QUERY).toContain('@@ROWCOUNT')
    expect(DELETE_TECHNOLOGY_QUERY).toContain('NOT EXISTS')
  })

  it('distingue « introuvable » de « référencée » dans la même réponse', () => {
    // Sans le compte d'existence, une entrée référencée et une entrée inexistante rendraient
    // toutes deux zéro ligne supprimée, et l'API répondrait 404 sur la première.
    expect(DELETE_COMMUNITY_QUERY).toContain('AS Existed')
    expect(DELETE_COMMUNITY_QUERY).toContain('AS ReferencingEvents')
  })

  it('refuse la suppression à un non-administrateur, et le journalise', async () => {
    const ctx = context()
    const response = await adminCommunity(
      new HttpRequest({
        method: 'DELETE',
        url: `https://api.example.com/api/admin/communities/${ID}`,
        params: { communityId: ID },
      }),
      ctx,
      session(ORGANIZER),
    )

    expect(response.status).toBe(403)
    expect(JSON.stringify(ctx.errors)).toContain('delete:community')
  })
})

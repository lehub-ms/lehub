import { HttpRequest, InvocationContext } from '@azure/functions'
import { describe, expect, it } from 'vitest'
import { adminCommunities } from '../src/functions/adminCommunities'
import { adminTechnologies } from '../src/functions/adminTechnologies'
import {
  LIST_ADMIN_COMMUNITIES_QUERY,
  LIST_COMMUNITIES_QUERY,
  mapAdminCommunity,
} from '../src/lib/communitiesRepo'
import { LIST_ADMIN_TECHNOLOGIES_QUERY, mapAdminTechnology } from '../src/lib/technologiesRepo'
import { type SessionPermissions } from '../src/lib/permissionsRepo'
import { type AuthenticatedIdentity } from '../src/lib/tokenValidation'
import { type AuthenticatedSession } from '../src/lib/withAuthorization'

const MEDIA = { baseUrl: 'https://media.example/media' }

const IDENTITY: AuthenticatedIdentity = {
  objectId: 'c722f670-cebf-4f94-b3b2-1723bfa372e6',
  email: 'organisateur@example.com',
  givenName: 'Amélie',
  familyName: 'Rousseau',
}

const ADMIN: SessionPermissions = { isGlobalAdmin: true, organizedCommunityIds: [] }
const ORGANIZER: SessionPermissions = {
  isGlobalAdmin: false,
  organizedCommunityIds: ['C1C1C1C1-0000-0000-0000-000000000001'],
}
const ORDINARY: SessionPermissions = { isGlobalAdmin: false, organizedCommunityIds: [] }

function session(permissions: SessionPermissions): AuthenticatedSession {
  return { identity: IDENTITY, permissions }
}

function request(path: string): HttpRequest {
  return new HttpRequest({ method: 'GET', url: `https://api.example.com/api/${path}` })
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

describe('habilitation des vues d’administration', () => {
  // Ni l'un ni l'autre n'atteint la base : le refus tombe avant, ce qui est aussi pourquoi ces
  // tests tournent sans serveur SQL.
  for (const [label, permissions] of [
    ['un organisateur', ORGANIZER],
    ['un compte ordinaire', ORDINARY],
  ] as const) {
    it(`refuse la liste des communautés à ${label}, en 403 et en le journalisant`, async () => {
      const ctx = context()
      const response = await adminCommunities(
        request('admin/communities'),
        ctx,
        session(permissions),
      )

      expect(response.status).toBe(403)
      expect((response.jsonBody as { code: string }).code).toBe('FORBIDDEN')

      const logged = JSON.stringify(ctx.errors)
      expect(logged).toContain('Authorization refused')
      expect(logged).toContain('read:admin-communities')
      expect(logged).toContain(IDENTITY.objectId)
      // Le journal identifie l'appelant, il ne le décrit pas.
      expect(logged).not.toContain(IDENTITY.email)
    })

    it(`refuse la liste des technologies à ${label}`, async () => {
      const response = await adminTechnologies(
        request('admin/technologies'),
        context(),
        session(permissions),
      )

      expect(response.status).toBe(403)
    })
  }

  it('ne dit pas à un non-administrateur ce qu’il aurait vu', async () => {
    const response = await adminCommunities(
      request('admin/communities'),
      context(),
      session(ORGANIZER),
    )

    // Le message est constant et ne nomme rien : un refus ne doit pas servir à énumérer.
    expect((response.jsonBody as { message: string }).message).toBe(
      'This action is not allowed for this account.',
    )
  })

  it('laisse passer un administrateur global au-delà de la garde', async () => {
    // Pas de base ici, donc l'appel échoue en aval — mais en 500 de lecture, pas en 403 : la
    // garde a bien laissé passer.
    const response = await adminCommunities(
      request('admin/communities'),
      context(),
      session(ADMIN),
    )

    expect(response.status).not.toBe(403)
  })
})

describe('requêtes des référentiels', () => {
  it('exclut les entrées archivées du contrat public, et d’elles seules', () => {
    expect(LIST_COMMUNITIES_QUERY).toContain("Status = 'active'")
    // La vue d'administration les montre : c'est de là qu'on les réactive.
    expect(LIST_ADMIN_COMMUNITIES_QUERY).not.toContain("Status = 'active'")
    expect(LIST_ADMIN_TECHNOLOGIES_QUERY).not.toContain("Status = 'active'")
  })

  it('compte les organisateurs et les évènements sans jointure croisée', () => {
    // Deux LEFT JOIN + GROUP BY multiplieraient les deux tables l'une par l'autre et rendraient
    // chaque compte égal au produit des deux.
    expect(LIST_ADMIN_COMMUNITIES_QUERY).toContain('AS OrganizerCount')
    expect(LIST_ADMIN_COMMUNITIES_QUERY).toContain('AS EventCount')
    expect(LIST_ADMIN_COMMUNITIES_QUERY).not.toContain('JOIN')
  })
})

describe('projection des lignes', () => {
  it('rend le chemin du logo et son URL absolue, jamais l’un sans l’autre', () => {
    const mapped = mapAdminCommunity(MEDIA)({
      Id: 'C1C1C1C1-0000-0000-0000-000000000001',
      Slug: 'azure-user-group-france',
      Name: 'Azure User Group France',
      LogoPath: 'communities/azure-user-group-france.svg',
      Description: 'L’écosystème Azure.',
      Status: 'active',
      OrganizerCount: 2,
      EventCount: 5,
    })

    // Le chemin, parce que le panneau le renvoie tel quel à l'enregistrement ; l'URL, parce que
    // l'aperçu l'affiche — recomposer l'un depuis l'autre mettrait mediaUrls dans un navigateur.
    expect(mapped.slug).toBe('azure-user-group-france')
    expect(mapped.logoPath).toBe('communities/azure-user-group-france.svg')
    expect(mapped.logoUrl).toBe(
      'https://media.example/media/communities/azure-user-group-france.svg',
    )
    expect(mapped.organizerCount).toBe(2)
    expect(mapped.eventCount).toBe(5)
  })

  it('rend une communauté sans logo sans fabriquer d’URL', () => {
    const mapped = mapAdminCommunity(MEDIA)({
      Id: 'C2C2C2C2-0000-0000-0000-000000000002',
      Slug: 'microsoft-365-community',
      Name: 'Microsoft 365 Community',
      LogoPath: null,
      Description: null,
      Status: 'archived',
      OrganizerCount: 0,
      EventCount: 0,
    })

    expect(mapped.logoPath).toBeNull()
    expect(mapped.logoUrl).toBeNull()
    // Zéro organisateur n'est pas une anomalie — Story #151 le dit en toutes lettres.
    expect(mapped.organizerCount).toBe(0)
    expect(mapped.status).toBe('archived')
  })

  it('rend une technologie sans description, parce qu’elle n’en porte pas', () => {
    const mapped = mapAdminTechnology(MEDIA)({
      Id: 'B1B1B1B1-0000-0000-0000-000000000001',
      Name: 'Azure',
      LogoPath: 'technologies/azure.svg',
      Status: 'active',
      EventCount: 3,
    })

    expect(mapped).not.toHaveProperty('description')
    expect(mapped.logoUrl).toBe('https://media.example/media/technologies/azure.svg')
    expect(mapped.eventCount).toBe(3)
  })
})

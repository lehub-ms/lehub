import { describe, expect, it } from 'vitest'
import { RESOLVE_PERMISSIONS_QUERY, mapPermissions, type PermissionRow } from '../src/lib/permissionsRepo'

const admin = (communityId: string | null = null): PermissionRow => ({ IsGlobalAdmin: true, CommunityId: communityId })
const plain = (communityId: string | null = null): PermissionRow => ({ IsGlobalAdmin: false, CommunityId: communityId })

describe('mapPermissions', () => {
  it("traite l'appelant sans ligne miroir comme un utilisateur ordinaire", () => {
    // Ni une erreur ni un cas limite : c'est l'état normal entre la première connexion
    // auprès du tenant et l'écriture de la ligne miroir.
    expect(mapPermissions([])).toEqual({ isGlobalAdmin: false, organizedCommunityIds: [] })
  })

  it("distingue l'administrateur sans communauté de l'appelant sans ligne", () => {
    // C'est tout l'intérêt du LEFT JOIN : les deux rendraient un ensemble vide de
    // communautés, et seul le marqueur les sépare.
    expect(mapPermissions([admin()])).toEqual({ isGlobalAdmin: true, organizedCommunityIds: [] })
  })

  it('rend les communautés organisées', () => {
    expect(mapPermissions([plain('c1'), plain('c2')])).toEqual({
      isGlobalAdmin: false,
      organizedCommunityIds: ['c1', 'c2'],
    })
  })

  it("laisse coexister les deux qualités sans que l'une masque l'autre", () => {
    // Un administrateur peut aussi organiser : le backoffice lui montre la section
    // d'administration générale *et* ses communautés.
    expect(mapPermissions([admin('c1'), admin('c2')])).toEqual({
      isGlobalAdmin: true,
      organizedCommunityIds: ['c1', 'c2'],
    })
  })

  it('ne rend jamais administrateur sur autre chose que la valeur vraie', () => {
    // Une dérive de schéma — la colonne rendue en 1, en '1' ou en null — ne doit pas
    // pouvoir se lire comme « administrateur ».
    for (const value of [1, '1', 'true', null, undefined]) {
      const row = { IsGlobalAdmin: value, CommunityId: null } as unknown as PermissionRow
      expect(mapPermissions([row]).isGlobalAdmin, String(value)).toBe(false)
    }
  })

  it('reste une seule requête quel que soit le nombre de communautés', () => {
    const rows = Array.from({ length: 200 }, (_, i) => plain(`c${i}`))
    expect(mapPermissions(rows).organizedCommunityIds).toHaveLength(200)
  })
})

describe('RESOLVE_PERMISSIONS_QUERY', () => {
  it('lit le marqueur et les communautés en un seul aller-retour', () => {
    expect(RESOLVE_PERMISSIONS_QUERY).toMatch(/FROM\s+dbo\.\[User\]/)
    expect(RESOLVE_PERMISSIONS_QUERY).toMatch(/LEFT JOIN\s+dbo\.CommunityOrganizer/)
  })

  it('conserve la ligne du compte qui n’organise rien', () => {
    // Un INNER JOIN rendrait un ensemble vide pour un administrateur sans communauté,
    // qui deviendrait alors indiscernable d'un compte sans ligne miroir.
    expect(RESOLVE_PERMISSIONS_QUERY).not.toMatch(/\bINNER JOIN\b/)
  })

  it('ne cible que le compte appelant, et par paramètre', () => {
    expect(RESOLVE_PERMISSIONS_QUERY).toContain('u.ExternalIdObjectId = @objectId')
    expect(RESOLVE_PERMISSIONS_QUERY).not.toContain('${')
  })
})

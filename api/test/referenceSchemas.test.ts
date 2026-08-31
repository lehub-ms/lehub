import { describe, expect, it } from 'vitest'
import {
  CREATE_COMMUNITY,
  CREATE_TECHNOLOGY,
  UPDATE_COMMUNITY,
  UPDATE_TECHNOLOGY,
} from '../src/lib/referenceSchemas'

/**
 * Chaque borne testée ici double une colonne, et le test nomme les deux : le schéma donne un
 * refus utile, la base donne la garantie. Si l'un des deux bouge sans l'autre, c'est ici que ça
 * se voit.
 */
describe('CREATE_COMMUNITY', () => {
  it('exige un nom et le rogne avant de le mesurer', () => {
    expect(CREATE_COMMUNITY.safeParse({ name: '   ' }).success).toBe(false)
    expect(CREATE_COMMUNITY.parse({ name: '  Azure User Group  ' }).name).toBe('Azure User Group')
  })

  it('borne le nom à la largeur de Community.Name — NVARCHAR(200)', () => {
    expect(CREATE_COMMUNITY.safeParse({ name: 'a'.repeat(200) }).success).toBe(true)
    expect(CREATE_COMMUNITY.safeParse({ name: 'a'.repeat(201) }).success).toBe(false)
  })

  it('borne la description à celle de Community.Description — NVARCHAR(300), migration 0002', () => {
    expect(CREATE_COMMUNITY.safeParse({ name: 'A', description: 'd'.repeat(300) }).success).toBe(true)
    expect(CREATE_COMMUNITY.safeParse({ name: 'A', description: 'd'.repeat(301) }).success).toBe(false)
  })

  it('borne le chemin du logo à celle de Community.LogoPath — NVARCHAR(500), migration 0003', () => {
    expect(CREATE_COMMUNITY.safeParse({ name: 'A', logoPath: 'p'.repeat(500) }).success).toBe(true)
    expect(CREATE_COMMUNITY.safeParse({ name: 'A', logoPath: 'p'.repeat(501) }).success).toBe(false)
  })

  it('crée une entrée active par défaut, et n’accepte pas d’autre statut que ceux du CHECK', () => {
    expect(CREATE_COMMUNITY.parse({ name: 'A' }).status).toBe('active')
    expect(CREATE_COMMUNITY.parse({ name: 'A', status: 'archived' }).status).toBe('archived')
    expect(CREATE_COMMUNITY.safeParse({ name: 'A', status: 'inactive' }).success).toBe(false)
  })

  it('traite l’absence et null de la même façon, pour que le repository n’en voie qu’une', () => {
    expect(CREATE_COMMUNITY.parse({ name: 'A' }).description).toBeNull()
    expect(CREATE_COMMUNITY.parse({ name: 'A', description: null }).description).toBeNull()
  })

  it('refuse une clé inconnue plutôt que de la laisser passer sans effet', () => {
    expect(CREATE_COMMUNITY.safeParse({ name: 'A', slog: 'oups' }).success).toBe(false)
  })
})

describe('UPDATE_COMMUNITY', () => {
  it('accepte un seul champ — c’est ce qui rend la réactivation possible depuis une ligne', () => {
    expect(UPDATE_COMMUNITY.safeParse({ status: 'active' }).success).toBe(true)
  })

  it('refuse un corps vide : une modification qui ne modifie rien est une erreur d’appel', () => {
    expect(UPDATE_COMMUNITY.safeParse({}).success).toBe(false)
  })

  it('n’invente aucun défaut — un champ absent reste absent', () => {
    expect(UPDATE_COMMUNITY.parse({ name: 'A' })).toEqual({ name: 'A' })
  })

  it('garde les mêmes bornes qu’à la création', () => {
    expect(UPDATE_COMMUNITY.safeParse({ name: 'a'.repeat(201) }).success).toBe(false)
    expect(UPDATE_COMMUNITY.safeParse({ description: 'd'.repeat(301) }).success).toBe(false)
  })
})

describe('CREATE_TECHNOLOGY', () => {
  it('ne porte pas de description : une technologie étiquette, elle ne se raconte pas', () => {
    expect(CREATE_TECHNOLOGY.safeParse({ name: 'Azure', description: 'x' }).success).toBe(false)
  })

  it('crée une entrée active par défaut', () => {
    expect(CREATE_TECHNOLOGY.parse({ name: 'Microsoft Fabric' }).status).toBe('active')
  })

  it('accepte une technologie sans icône — l’absence de logo est un cas normal', () => {
    expect(CREATE_TECHNOLOGY.parse({ name: '.NET' }).logoPath).toBeNull()
  })
})

describe('UPDATE_TECHNOLOGY', () => {
  it('accepte le seul statut et refuse le corps vide', () => {
    expect(UPDATE_TECHNOLOGY.safeParse({ status: 'archived' }).success).toBe(true)
    expect(UPDATE_TECHNOLOGY.safeParse({}).success).toBe(false)
  })
})

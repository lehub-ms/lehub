import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { REFERENCE_SCHEMAS } from '../src/lib/referenceSchemas'

/**
 * La garde anti-dérive, et la raison d'être des schémas d'exécution.
 *
 * Feature #170 dérivera son document OpenAPI de ces objets-là. Le risque n'est pas d'écrire ce
 * document, c'est qu'il mente : un contrat décrit à la main s'écarte du code au premier
 * changement. Ce test ne produit rien — il vérifie seulement que chaque schéma *se laisse*
 * décrire, et il échoue le jour où l'un cesse de l'être, pas le jour où #170 s'ouvre.
 *
 * `unrepresentable: 'throw'` est le défaut de zod : un type sans équivalent JSON Schema (une
 * Date, une Map, une transformation) jette au lieu de produire un `{}` muet. C'est exactement
 * l'échec bruyant qu'on veut ici.
 */
describe('dérivation OpenAPI des schémas de requête', () => {
  it('énumère bien tous les schémas exportés', () => {
    // Un schéma ajouté au module mais pas au tableau échapperait à toutes les assertions
    // ci-dessous. Le compte est donc lui-même assertion.
    expect(REFERENCE_SCHEMAS).toHaveLength(4)
  })

  for (const schema of REFERENCE_SCHEMAS) {
    const id = schema.meta()?.id ?? '(sans id)'

    it(`décrit ${id} en OpenAPI 3.0 sans intervention manuelle`, () => {
      const derive = () => z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' })

      expect(derive).not.toThrow()
      const derived = derive()

      // Un `$ref` vers un `$defs` nommé : c'est ce que `.meta({ id })` achète, et ce qui
      // permettra à #170 de composer un document lisible plutôt qu'une soupe anonyme.
      expect(JSON.stringify(derived)).toContain(id)
    })

    it(`documente ${id} avec un titre et une description tirés du schéma lui-même`, () => {
      const meta = schema.meta()

      // La prose du document vient du même objet que la validation. C'est toute la garantie :
      // il n'existe pas de second endroit où elle pourrait dire autre chose.
      expect(meta?.title).toBeTruthy()
      expect(meta?.description).toBeTruthy()
    })
  }

  it('décrit le corps de création avec ses champs, ses bornes et son refus des clés inconnues', () => {
    const derived: unknown = z.toJSONSchema(REFERENCE_SCHEMAS[0], {
      target: 'openapi-3.0',
      io: 'input',
    })
    const { definitions } = derived as { definitions: Record<string, unknown> }
    const community = definitions['CreateCommunity'] as {
      required: string[]
      additionalProperties: boolean
      properties: Record<string, { maxLength?: number }>
    }

    // `io: 'input'` : le nom est le seul champ qu'un appelant doit fournir, les autres portent
    // un défaut. En `io: 'output'` ils seraient tous requis, ce qui décrirait la mauvaise moitié
    // du contrat.
    expect(community.required).toEqual(['name'])
    expect(community.additionalProperties).toBe(false)
    expect(community.properties['name']?.maxLength).toBe(200)
    expect(community.properties['description']?.maxLength).toBe(300)
  })
})

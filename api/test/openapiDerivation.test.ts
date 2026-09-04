import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import * as designationSchemas from '../src/lib/designationSchemas'
import * as eventSchemas from '../src/lib/eventSchemas'
import * as preferenceSchemas from '../src/lib/preferenceSchemas'
import * as referenceSchemas from '../src/lib/referenceSchemas'
import { ALL_REQUEST_SCHEMAS } from '../src/lib/requestSchemas'
import * as uploadSchemas from '../src/lib/uploadSchemas'

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
 *
 * Il porte sur `ALL_REQUEST_SCHEMAS` et non sur un tableau par famille, parce que la version qui
 * ne parcourait que `REFERENCE_SCHEMAS` ne voyait pas `UPLOAD_DESTINATION` — un schéma pourtant
 * complet, resté hors de toute assertion. Deux moitiés le remplacent : tout ce qui est listé se
 * décrit, et tout ce qui est exporté est listé. C'est la seconde qui rend l'oubli impossible
 * plutôt qu'improbable.
 */

/** Les modules de schémas, tels que le registre est censé les couvrir intégralement. */
const SCHEMA_MODULES: Record<string, Record<string, unknown>> = {
  referenceSchemas,
  uploadSchemas,
  designationSchemas,
  eventSchemas,
  preferenceSchemas,
}

describe('dérivation OpenAPI des schémas de requête', () => {
  it('couvre tout ce que les modules de schémas exportent', () => {
    // L'assertion qui remplace un `toHaveLength` codé en dur : un schéma ajouté à un module mais
    // pas au registre échapperait à toutes les autres. Le comparer par nom plutôt que par
    // identité rend l'échec lisible — « SearchAccounts manque » et non « attendu 6, reçu 7 ».
    const registered = new Set<unknown>(ALL_REQUEST_SCHEMAS)
    const exported = Object.entries(SCHEMA_MODULES).flatMap(([module, members]) =>
      Object.entries(members)
        .filter(([, value]) => value instanceof z.ZodType)
        .map(([name, value]) => ({ name: `${module}.${name}`, value })),
    )

    expect(exported.filter((entry) => !registered.has(entry.value)).map((e) => e.name)).toEqual([])
    // Et l'inverse : le registre ne contient rien d'autre que ces exports.
    expect(ALL_REQUEST_SCHEMAS).toHaveLength(exported.length)  })

  it('donne un identifiant distinct à chaque schéma', () => {
    // Deux `$defs` de même nom s'écraseraient l'un l'autre dans le document, silencieusement.
    const ids = ALL_REQUEST_SCHEMAS.map((schema) => schema.meta()?.id)

    expect(ids).not.toContain(undefined)
    expect(new Set(ids).size).toBe(ids.length)
  })

  for (const schema of ALL_REQUEST_SCHEMAS) {
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
    const derived: unknown = z.toJSONSchema(referenceSchemas.CREATE_COMMUNITY, {
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

  it('décrit l’adresse d’un compte avec son format et sa borne de colonne', () => {
    const derived: unknown = z.toJSONSchema(designationSchemas.ACCOUNT_EMAIL, {
      target: 'openapi-3.0',
      io: 'input',
    })
    const { definitions } = derived as { definitions: Record<string, unknown> }
    const body = definitions['AccountEmail'] as {
      required: string[]
      additionalProperties: boolean
      properties: Record<string, { maxLength?: number; format?: string }>
    }

    // `format: "email"` est ce que le `.trim()` absent achète : une transformation devant un
    // contrôle de format rendrait le schéma indérivable, et le document perdrait le format.
    expect(body.required).toEqual(['email'])
    expect(body.additionalProperties).toBe(false)
    expect(body.properties['email']?.format).toBe('email')
    expect(body.properties['email']?.maxLength).toBe(designationSchemas.EMAIL_COLUMN_LENGTH)
  })
})

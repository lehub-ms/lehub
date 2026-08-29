import { describe, expect, it } from 'vitest'
import { APPLY_ADMIN_BOOTSTRAP_QUERY, MIRROR_USER_QUERY, isUniqueViolation } from '../src/lib/userRepo'

/**
 * Le miroir est une écriture, et une écriture ne se teste honnêtement que contre une base.
 * Ce que ces tests couvrent, c'est ce qu'une base ne dirait pas mieux : les invariants sont
 * portés par le texte de l'instruction, et une relecture distraite peut les défaire sans que
 * rien d'autre ne s'en aperçoive. Le comportement, lui, se vérifie sur le SQL local — voir la
 * section de vérification de la PR.
 */
const UPDATE_CLAUSE = MIRROR_USER_QUERY.slice(
  MIRROR_USER_QUERY.indexOf('WHEN MATCHED'),
  MIRROR_USER_QUERY.indexOf('WHEN NOT MATCHED'),
)

const INSERT_CLAUSE = MIRROR_USER_QUERY.slice(
  MIRROR_USER_QUERY.indexOf('WHEN NOT MATCHED'),
  MIRROR_USER_QUERY.indexOf('OUTPUT'),
)

describe('MIRROR_USER_QUERY', () => {
  it("écrit la méthode d'authentification primaire à la création et jamais ensuite", () => {
    expect(INSERT_CLAUSE).toContain('PrimaryAuthMethod')
    // C'est l'immuabilité : elle tient à l'absence de tout chemin qui la réécrive.
    expect(UPDATE_CLAUSE).not.toContain('PrimaryAuthMethod')
    expect(UPDATE_CLAUSE).toContain('LastAuthMethod')
  })

  it('conserve la valeur en base quand un claim revient vide', () => {
    for (const column of ['Email', 'GivenName', 'Surname']) {
      expect(UPDATE_CLAUSE, column).toContain(`COALESCE(@${column[0]!.toLowerCase()}${column.slice(1)}, target.${column})`)
    }
  })

  it("n'insère que si les trois colonnes obligatoires ont une valeur", () => {
    for (const parameter of ['@email', '@givenName', '@surname']) {
      expect(INSERT_CLAUSE, parameter).toContain(`${parameter} IS NOT NULL`)
    }
  })

  it('sérialise deux connexions simultanées du même compte', () => {
    // Sans HOLDLOCK, MERGE cherche la ligne puis insère en deux temps, et deux sessions qui
    // se croisent dans cet intervalle décident toutes les deux d'insérer.
    expect(MIRROR_USER_QUERY).toContain('WITH (HOLDLOCK)')
  })

  it('ne contient aucune valeur interpolée', () => {
    // Première requête paramétrée du dépôt : les précédentes sont statiques et sans entrée
    // utilisateur. Rien ici ne doit être construit par concaténation.
    expect(MIRROR_USER_QUERY).not.toContain('${')
    expect(MIRROR_USER_QUERY).not.toContain("' +")
  })
})

describe('APPLY_ADMIN_BOOTSTRAP_QUERY', () => {
  const [PROMOTE = '', STAMP = ''] = APPLY_ADMIN_BOOTSTRAP_QUERY.split(';').filter((s) => s.trim())

  it('promeut avant de marquer, pour qu’une panne entre les deux se rattrape', () => {
    // L'ordre inverse perdrait la promotion pour de bon : l'adresse serait marquée comme
    // appliquée sur un compte qui n'a jamais reçu le marqueur, et rejouer le seed ne
    // réarme rien. Dans cet ordre-là, la connexion suivante repromeut et marque.
    expect(PROMOTE).toContain('IsGlobalAdmin = 1')
    expect(STAMP).toContain('AppliedAt = SYSUTCDATETIME()')
  })

  it('ne promeut que ce qui est en attente, jamais ce qui a déjà été appliqué', () => {
    // C'est tout ce qui empêche l'amorçage de redevenir une règle permanente : sans ce
    // prédicat, un administrateur retiré depuis le backoffice serait repromu à sa
    // prochaine connexion.
    for (const statement of [PROMOTE, STAMP]) {
      expect(statement).toContain('AppliedAt IS NULL')
    }
  })

  it('ne rétrograde personne', () => {
    // Le seul chemin d'écriture du marqueur ici est la mise à 1. Une remise à 0 ne peut
    // pas venir de l'amorçage, quel que soit le nombre de rejeux.
    expect(APPLY_ADMIN_BOOTSTRAP_QUERY).not.toContain('IsGlobalAdmin = 0')
  })

  it("ne touche qu'au compte qui se connecte", () => {
    for (const statement of [PROMOTE, STAMP]) {
      expect(statement).toContain('u.ExternalIdObjectId = @objectId')
    }
  })

  it('ne contient aucune valeur interpolée', () => {
    expect(APPLY_ADMIN_BOOTSTRAP_QUERY).not.toContain('${')
    expect(APPLY_ADMIN_BOOTSTRAP_QUERY).not.toContain("' +")
  })
})

describe('isUniqueViolation', () => {
  it("reconnaît les deux codes SQL Server d'unicité", () => {
    for (const number of [2601, 2627]) {
      expect(isUniqueViolation({ number }), String(number)).toBe(true)
    }
  })

  it('laisse remonter toute autre erreur plutôt que de la travestir en conflit', () => {
    for (const error of [{ number: 547 }, { number: 8152 }, {}, null, undefined, new Error('boom')]) {
      expect(isUniqueViolation(error), JSON.stringify(error)).toBe(false)
    }
  })
})

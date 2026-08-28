import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Comme api/test/seedMedia.test.ts, cette suite lit hors de api/ à dessein.
 *
 * Les désignations d'organisateurs de db/seed/demo.sql sont écrites en identifiants
 * bruts, et rien dans la chaîne ne joue le seed contre une base : la CI exécute les
 * trois suites de tests et `az bicep build`, pas `db-seed.sh`. Un identifiant de
 * communauté renommé plus haut dans le même fichier ne se verrait donc qu'au premier
 * `dev-up.sh` d'un contributeur, sous la forme d'une violation de clé étrangère au
 * milieu d'un bootstrap.
 */
const DEMO_SQL = readFileSync(join(resolve(import.meta.dirname, '..', '..'), 'db', 'seed', 'demo.sql'), 'utf8')

const GUID = '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}'

/** Le bloc VALUES d'un MERGE, du nom de la table au MERGE suivant ou à la fin du fichier. */
function mergeBlock(table: string): string {
  const start = DEMO_SQL.indexOf(`MERGE ${table} AS target`)
  expect(start, `MERGE ${table} introuvable dans demo.sql`).toBeGreaterThan(-1)
  const next = DEMO_SQL.indexOf('\nMERGE ', start + 1)
  return DEMO_SQL.slice(start, next === -1 ? undefined : next)
}

/** Le premier identifiant de chaque ligne de valeurs — la clé primaire, par convention du fichier. */
function declaredIds(table: string): Set<string> {
  const matches = mergeBlock(table).matchAll(new RegExp(`^\\s*\\('(${GUID})'`, 'gim'))
  return new Set([...matches].map((m) => (m[1] as string).toUpperCase()))
}

describe('désignations d’organisateurs de démonstration', () => {
  const communities = declaredIds('dbo.Community')
  const users = declaredIds('dbo.[User]')
  const designations = [
    ...mergeBlock('dbo.CommunityOrganizer').matchAll(new RegExp(`\\('(${GUID})',\\s*'(${GUID})'\\)`, 'gi')),
  ].map((m) => ({ community: (m[1] as string).toUpperCase(), user: (m[2] as string).toUpperCase() }))

  it('en déclare au moins une', () => {
    // Sans ce garde-fou, une expression régulière devenue muette ferait passer tous les
    // tests suivants sur un ensemble vide.
    expect(designations.length).toBeGreaterThan(0)
    expect(communities.size).toBeGreaterThan(0)
    expect(users.size).toBeGreaterThan(0)
  })

  it('ne désigne que des communautés déclarées dans le même fichier', () => {
    for (const { community } of designations) {
      expect(communities, community).toContain(community)
    }
  })

  it('ne désigne que des comptes déclarés dans le même fichier', () => {
    // La clé étrangère l'exigerait de toute façon : un compte ne peut pas organiser sans
    // exister au miroir. C'est l'edge case « désignation d'un compte absent du miroir ».
    for (const { user } of designations) {
      expect(users, user).toContain(user)
    }
  })

  it('ne désigne jamais deux fois le même couple', () => {
    const couples = designations.map(({ community, user }) => `${community}/${user}`)
    expect(new Set(couples).size).toBe(couples.length)
  })

  it('couvre les trois formes que le backoffice doit savoir afficher', () => {
    const byCommunity = new Map<string, number>()
    const byUser = new Map<string, number>()
    for (const { community, user } of designations) {
      byCommunity.set(community, (byCommunity.get(community) ?? 0) + 1)
      byUser.set(user, (byUser.get(user) ?? 0) + 1)
    }
    // Un organisateur de plusieurs communautés, pour que le sélecteur ait de quoi choisir.
    expect([...byUser.values()].some((n) => n > 1)).toBe(true)
    // Une communauté à plusieurs organisateurs, pour qu'un retrait ne la vide pas.
    expect([...byCommunity.values()].some((n) => n > 1)).toBe(true)
    // Une communauté sans aucun organisateur : un état normal, pas une anomalie.
    expect(byCommunity.size).toBeLessThan(communities.size)
  })

  it('n’invente que des adresses impossibles à attribuer', () => {
    // .invalid est réservé par la RFC 2606 et ne peut pas être enregistré : aucun de ces
    // comptes fictifs ne peut joindre une vraie personne, ni entrer en collision avec la
    // ligne miroir d'un contributeur.
    const addresses = [...mergeBlock('dbo.[User]').matchAll(/N'([^']*@[^']*)'/g)].map((m) => m[1] as string)
    expect(addresses.length).toBe(users.size)
    for (const address of addresses) {
      expect(address, address).toMatch(/\.invalid$/)
    }
  })
})

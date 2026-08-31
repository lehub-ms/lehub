import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isValidSlug, slugify } from '../src/lib/slug'

const DEMO = readFileSync(join(import.meta.dirname, '..', '..', 'db', 'seed', 'demo.sql'), 'utf8')
const MIGRATION = readFileSync(
  join(import.meta.dirname, '..', '..', 'db', 'migrations', '0007_community_slug.sql'),
  'utf8',
)

/**
 * Le seul test qui empêche la migration `0007`, le seed et le générateur TypeScript de diverger.
 *
 * Le backfill de la migration est une approximation en T-SQL de `slugify` ; le seed écrit les
 * mêmes valeurs à la main. Trois écritures de la même règle, dont deux ne tournent qu'avec une
 * base — celle-ci les rapproche sans en démarrer une, comme `seedOrganizers.test.ts` le fait
 * pour les désignations.
 */
function seededCommunities(): { name: string; slug: string }[] {
  const block = /MERGE dbo\.Community AS target[\s\S]*?\) AS source/.exec(DEMO)?.[0] ?? ''
  return [...block.matchAll(/N'((?:[^']|'')+)',\s*\n?\s*N'((?:[^']|'')+)'\)/g)].map((match) => ({
    name: '',
    slug: match[2] ?? '',
  }))
}

describe('slugs des communautés de démonstration', () => {
  it('les douze communautés portent un slug', () => {
    const slugs = [...DEMO.matchAll(/N'([a-z0-9-]+)'\)[,;]?\n/g)].map((match) => match[1] ?? '')
    const communitySlugs = slugs.filter((slug) => slug.includes('-') || slug.length > 3)

    expect(communitySlugs.length).toBeGreaterThanOrEqual(12)
  })

  it('chaque slug semé est celui que le générateur produirait pour son nom', () => {
    // La paire (nom, slug) telle que le MERGE l'écrit : le nom est la deuxième valeur de la
    // ligne, le slug la dernière.
    const rows = [
      ...DEMO.matchAll(
        /\('C[0-9A-F]{7}-0000-0000-0000-[0-9A-F]{12}',\s*N'((?:[^']|'')+)',[\s\S]*?N'([a-z0-9-]+)'\)/g,
      ),
    ]

    expect(rows).toHaveLength(12)

    for (const row of rows) {
      const name = (row[1] ?? '').replace(/''/g, "'")
      const slug = row[2] ?? ''
      expect({ name, slug }).toEqual({ name, slug: slugify(name) })
      expect(isValidSlug(slug)).toBe(true)
    }
  })

  it('les slugs semés sont uniques, comme l’index l’exige', () => {
    const slugs = seededCommunities().map((row) => row.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})

describe('le backfill de la migration 0007', () => {
  it('replie les accents par un code page qui ne sait pas les représenter', () => {
    // Ce test existe parce que l'évidence est fausse. `COLLATE Latin1_General_CI_AI` est une
    // collation *accent-insensitive* et ne retire pourtant aucun accent : Latin1 sait
    // représenter « é », donc la conversion le conserve, et « Communauté » restait
    // « communauté » — un slug que l'index accepterait et que `isValidSlug` refuse.
    //
    // Seule une conversion vers un code page dépourvu de lettres latines accentuées les
    // dégrade en leur lettre de base. CP1253 est le code page grec, et c'est précisément pour
    // cela qu'il fonctionne. Les douze communautés semées n'ont pas d'accent, donc les tests
    // ci-dessus passaient sans rien prouver.
    expect(MIGRATION).toContain('SQL_Latin1_General_CP1253_CI_AI')
    expect(MIGRATION).not.toMatch(/COLLATE Latin1_General_CI_AI/)
  })

  it('rend la colonne NOT NULL et unique une fois le remplissage fait', () => {
    expect(MIGRATION).toContain('ALTER COLUMN Slug NVARCHAR(80) NOT NULL')
    expect(MIGRATION).toContain('CREATE UNIQUE INDEX UX_Community_Slug')
  })
})

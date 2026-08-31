/**
 * Le slug **proposé** à la frappe dans le panneau d'édition.
 *
 * Le serveur fait foi — `api/src/lib/slug.ts` décide de ce qui est enregistré, et l'index unique
 * `UX_Community_Slug` tranche les collisions. Cette copie ne sert qu'à remplir le champ pendant
 * qu'on tape un nom, et à refuser une saisie manifestement mal formée avant l'aller-retour.
 *
 * Écrite deux fois, comme les DTO : `@lehub/shared` est un paquet front-end qu'une application
 * Functions ne peut pas importer. `api/test/seedSlug.test.ts` et les deux jeux de tests, qui
 * partagent les mêmes cas, empêchent les deux copies de diverger.
 */

const MAX_LENGTH = 60

/** La largeur de la colonne : la marge sert au suffixe de départage et à une saisie manuelle. */
export const SLUG_MAX_LENGTH = 80

const SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const GUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** La chaîne vide quand rien ne survit : le formulaire ne propose alors rien et le demande. */
export function slugify(name: string): string {
  const folded = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')

  const trimmed = trimDashes(folded)
  if (trimmed.length <= MAX_LENGTH) return trimmed

  const cut = trimmed.slice(0, MAX_LENGTH)
  const lastDash = cut.lastIndexOf('-')
  return trimDashes(lastDash > 0 ? cut.slice(0, lastDash) : cut)
}

function trimDashes(value: string): string {
  return value.replace(/^-+/, '').replace(/-+$/, '')
}

export function isValidSlug(value: string): boolean {
  if (value.length === 0 || value.length > SLUG_MAX_LENGTH) return false
  if (GUID_SHAPE.test(value)) return false
  return SHAPE.test(value)
}

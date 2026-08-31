/**
 * L'accord en nombre des mots que les écrans composent eux-mêmes.
 *
 * Les deux formes sont fournies, jamais dérivées : l'adjectif s'accorde en genre avec le nom
 * qu'il suit, et le référentiel suivant ne sera pas forcément féminin — « une communauté
 * archivée », mais « un évènement archivé » quand #143 arrivera. Une fonction qui ajouterait un
 * « s » saurait accorder le nombre et se tromperait sur le genre une fois sur deux.
 *
 * Module à part et non export d'un composant : `react-refresh/only-export-components` refuse
 * qu'un fichier `.tsx` exporte autre chose que des composants, et l'accord n'est ni du tri ni de
 * la recherche, donc pas sa place dans `referenceFilters`.
 */
export interface Word {
  one: string
  many: string
}

/** Zéro prend le singulier, comme le veut l'usage français — « 0 communauté ». */
export function agree(word: Word, count: number): string {
  return count > 1 ? word.many : word.one
}

/** « 3 communautés archivées » : le nombre, puis les mots qui s'accordent avec lui. */
export function quantify(count: number, ...words: readonly Word[]): string {
  return [String(count), ...words.map((word) => agree(word, count))].join(' ')
}

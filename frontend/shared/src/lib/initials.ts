/**
 * Up to two initials — "Azure User Group France" gives "AU", not "A".
 *
 * One letter was not enough and the carousel showed why: "Azure User Group France", "… Bordeaux"
 * and "… Toulouse" were three identical discs. The backoffice mock-ups ask for two, and Story
 * #152 says "les initiales", plural.
 *
 * Punctuation is dropped before splitting so "Tech & Wine Marseille" gives "TW" rather than "T&".
 * A name made only of symbols keeps the placeholder rather than rendering an empty disc.
 */
export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

  return words.slice(0, 2).map((word) => word.charAt(0).toLocaleUpperCase('fr')).join('') || '?'
}

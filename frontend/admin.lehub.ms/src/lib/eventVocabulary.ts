/**
 * Le seul endroit où le vocabulaire du contrat devient celui de l'écran.
 *
 * L'API porte `format` (`dbo.FormatType` : Conférence, Meetup, Webinaire, Hackathon, Atelier,
 * Autre) et `mode` (`dbo.EventMode` : Présentiel, En ligne, Hybride). Le backoffice, lui, appelle
 * le premier **Type** et le second **Format** — c'est ce que #145 spécifie, et c'est la façon
 * dont un organisateur en parle.
 *
 * Le décalage est assumé plutôt que corrigé : `format` et `mode` sont déjà publiés par le
 * contrat public que consomme lehub.ms, et les renommer coûterait une rupture pour un gain
 * purement nominal. Ce qu'on refuse, c'est que la traduction se fasse à trois endroits ; elle
 * se fait ici, et un écran qui affiche un libellé le prend d'ici.
 */

/** Ce que l'écran appelle « Type » — le champ `format`, l'identifiant `formatTypeId`. */
export const TYPE_LABEL = 'Type'

/** Ce que l'écran appelle « Format » — le champ `mode`, l'identifiant `eventModeId`. */
export const FORMAT_LABEL = 'Format'

/** L'aide qui désamorce la confusion là où les deux champs se touchent. */
export const TYPE_HINT =
  'Ce que l’évènement est. Le format dit comment on y participe — les deux sont demandés.'

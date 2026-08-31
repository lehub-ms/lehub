import type { SessionPermissions } from '@lehub/shared/auth/AuthContext'
import type { ChipEntry } from '@/components/events/ChipPicker'
import type { NamedRef } from '@/lib/api'

/**
 * Ce que l'écran des rattachements décide, sans rien rendre.
 *
 * Pur, donc éprouvable sans monter de formulaire — et c'est ce qui compte ici, parce que les
 * règles de #147 se répondent différemment selon *quatre* choses à la fois : les habilitations de
 * la session, les communautés déjà rattachées, celles actuellement cochées, et celle qu'on
 * essaie de décocher. Une logique de ce genre enfouie dans le JSX ne se vérifierait qu'au clic.
 *
 * **Rien de tout cela ne protège quoi que ce soit.** L'API refuse la même écriture qu'une
 * pastille ait été cliquable ou non (#109) ; ces règles-ci évitent seulement qu'on découvre le
 * refus après coup.
 */

export const SHARING_NOTE =
  'Rattacher une communauté en partage la gestion : ses organisateurs pourront modifier et supprimer cet évènement.'

export const LOCKED_THIRD_PARTY =
  'Seul un administrateur peut retirer une communauté que vous n’organisez pas.'

export const LOCKED_LAST =
  'Un évènement doit porter au moins une communauté : sans elle, seuls les administrateurs pourraient encore le gérer.'

export const CONFIRM_HANDOVER =
  'Vous retirez la dernière communauté que vous organisez sur cet évènement. Vous en perdrez l’accès. Continuer ?'

/**
 * Insensible à la casse, comme partout : ces identifiants viennent d'une réponse d'API, et rien
 * n'oblige les deux lectures qui les portent — le référentiel et l'évènement — à s'accorder
 * dessus. C'est la même précaution que `sameId` côté serveur, et pour la même raison.
 *
 * Exporté parce que `ChipPicker` compare les mêmes identifiants : une pastille calculée ici
 * comme rattachée et lue là-bas comme absente s'afficherait décochée, et un clic empilerait un
 * doublon au lieu de la retirer.
 */
export function sameId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

function organizes(permissions: SessionPermissions, communityId: string): boolean {
  return permissions.organizedCommunityIds.some((id) => sameId(id, communityId))
}

interface CommunityChipsInput {
  /** Les communautés actives du référentiel : ce qui est proposé à l'ajout. */
  offered: readonly NamedRef[]
  /** Celles que l'évènement portait **à l'ouverture** du formulaire. */
  attached: readonly NamedRef[]
  /** Celles actuellement cochées dans le brouillon. */
  selected: readonly string[]
  permissions: SessionPermissions
}

/**
 * Les pastilles de communautés, avec ce qui se retire et à quel prix.
 *
 * La liste proposée est **l'union des actives et des déjà rattachées**. Une entrée archivée que
 * l'évènement porte reste donc visible et décochable — c'est tout l'intérêt d'archiver plutôt
 * que de supprimer — sans jamais être offerte à un évènement qui ne l'avait pas.
 *
 * Le verrou du retrait tiers ne porte que sur ce qui était **déjà rattaché**. Décocher une
 * communauté qu'on vient d'ajouter dans la même saisie n'est pas un retrait : le serveur compare
 * au contenu de la base, où elle ne figure pas encore, et interdire ici ce qu'il autorise là
 * reviendrait à piéger quelqu'un sur son propre clic.
 */
export function communityChips({
  offered,
  attached,
  selected,
  permissions,
}: CommunityChipsInput): ChipEntry[] {
  const entries = [...offered]
  for (const community of attached) {
    if (!entries.some((entry) => sameId(entry.id, community.id))) entries.push(community)
  }

  // Combien de communautés organisées par l'appelant restent cochées : c'est ce qui distingue
  // « je passe la main » d'un simple retrait parmi d'autres.
  const mineSelected = selected.filter((id) => organizes(permissions, id))

  return entries.map((entry) => {
    if (permissions.isGlobalAdmin) return { ...entry }

    const wasAttached = attached.some((community) => sameId(community.id, entry.id))
    const isSelected = selected.some((id) => sameId(id, entry.id))

    if (!isSelected) return { ...entry }

    if (wasAttached && !organizes(permissions, entry.id)) {
      return { ...entry, lockedReason: LOCKED_THIRD_PARTY }
    }
    if (selected.length === 1) return { ...entry, lockedReason: LOCKED_LAST }

    // Passage de main : la dernière qu'on organise s'en va, une autre demeure. Permis, et
    // annoncé — l'accès à l'évènement part avec elle.
    if (organizes(permissions, entry.id) && mineSelected.length === 1) {
      return { ...entry, confirmRemoval: CONFIRM_HANDOVER }
    }

    return { ...entry }
  })
}

/**
 * Les pastilles de technologies : la même union, et aucune règle.
 *
 * Rattacher une technologie ne donne la main à personne — il n'y a donc rien à borner, et
 * l'asymétrie que #147 décrit ne concerne que les communautés.
 */
export function technologyChips(
  offered: readonly NamedRef[],
  attached: readonly NamedRef[],
): ChipEntry[] {
  const entries = [...offered]
  for (const technology of attached) {
    if (!entries.some((entry) => sameId(entry.id, technology.id))) entries.push(technology)
  }
  return entries.map((entry) => ({ ...entry }))
}

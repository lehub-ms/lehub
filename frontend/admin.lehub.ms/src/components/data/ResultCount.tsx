import type { ReactNode } from 'react'
import { quantify, type Word } from '@/lib/words'

interface ResultCountProps {
  activeCount: number
  /** « communauté » / « communautés ». */
  noun: Word
  /**
   * « active » / « actives » — accordé au genre du nom, donc fourni par l'appelant.
   *
   * Facultatif : une liste de personnes n'a pas d'adjectif à accorder. « 3 organisateurs » se
   * suffit, et « 3 organisateurs actifs » annoncerait une distinction qui n'existe pas.
   */
  activeWord?: Word
  /**
   * La population repliée, quand il y en a une.
   *
   * Facultative parce qu'une liste de personnes n'en a pas : un organisateur n'est ni actif ni
   * archivé, il est désigné ou il ne l'est pas (#158, #159). Lui passer `0` et un adjectif
   * fantoche compilerait et mentirait au composant.
   */
  archivedCount?: number
  /** « archivée » / « archivées ». Exigé dès que `archivedCount` est fourni. */
  archivedWord?: Word
}

/**
 * Le nombre d'entrées affichées, annoncé, et les deux populations distinguées.
 *
 * Un total ne correspondrait à aucune des deux listes visibles (#173) : les archivées sont
 * derrière un repli, et annoncer « 3 communautés » quand deux seulement sont à l'écran est faux
 * de la façon la plus discrète qui soit.
 *
 * Les deux comptes portent sur ce que la recherche laisse passer, si bien que ce décompte et le
 * nombre de la ligne de groupe disent toujours la même chose. La part archivée disparaît quand
 * elle est nulle, plutôt que d'annoncer « · 0 archivée » — du bruit sur une population qui
 * n'existe pas.
 *
 * `role="status"` avec `aria-live="polite"` : la valeur change à chaque frappe dans la
 * recherche, et c'est précisément à ce moment qu'une personne qui ne voit pas la table a besoin
 * de savoir combien il en reste. `aria-atomic` pour que la phrase soit relue entière.
 */
export function ResultCount({
  activeCount,
  archivedCount = 0,
  noun,
  activeWord,
  archivedWord,
}: ResultCountProps): ReactNode {
  return (
    <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-ink-muted">
      {activeWord ? quantify(activeCount, noun, activeWord) : quantify(activeCount, noun)}
      {archivedCount > 0 && archivedWord ? ` · ${quantify(archivedCount, archivedWord)}` : null}
    </p>
  )
}

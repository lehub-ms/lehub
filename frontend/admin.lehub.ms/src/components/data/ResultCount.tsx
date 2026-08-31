import type { ReactNode } from 'react'

interface ResultCountProps {
  count: number
  /** « communauté » / « communautés » : accordé par l'appelant, qui seul connaît le mot. */
  singular: string
  plural: string
}

/**
 * Le nombre d'entrées affichées, annoncé.
 *
 * `role="status"` avec `aria-live="polite"` : la valeur change à chaque frappe dans la recherche,
 * et c'est précisément à ce moment qu'une personne qui ne voit pas la table a besoin de savoir
 * combien il en reste. `aria-atomic` pour que la phrase soit relue entière plutôt que le seul
 * chiffre, qui ne voudrait rien dire seul.
 *
 * Zéro prend le singulier, comme le veut l'usage français — « 0 communauté ».
 */
export function ResultCount({ count, singular, plural }: ResultCountProps): ReactNode {
  return (
    <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-ink-muted">
      {count} {count > 1 ? plural : singular}
    </p>
  )
}

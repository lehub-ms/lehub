import type { ReactNode } from 'react'
import { cn } from '@lehub/shared/lib/cn'
import type { ReferenceStatus } from '@/lib/api'

/**
 * Le statut d'une entrée, lisible d'un coup d'œil dans la table.
 *
 * « Archivée » et non « Inactive » comme sur les maquettes : c'est le mot du modèle et celui de
 * l'action qui y mène, et deux vocabulaires pour un même état finissent par désigner deux choses
 * différentes dans la tête des gens. L'écart est à reporter au projet Claude Design.
 *
 * La couleur ne porte pas l'information seule — le mot est là, ce qui est ce que demande le
 * critère de non-dépendance à la couleur.
 */
export function StatusTag({ status }: { status: ReferenceStatus }): ReactNode {
  const archived = status === 'archived'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
        archived ? 'bg-slate-100 text-ink-muted' : 'bg-primary-xs text-primary',
      )}
    >
      {archived ? 'Archivée' : 'Active'}
    </span>
  )
}

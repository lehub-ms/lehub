import type { ReactNode } from 'react'
import { cn } from '@lehub/shared/lib/cn'
import type { ReferenceStatus } from '@/lib/api'

/**
 * Le statut d'une entrée, lisible d'un coup d'œil dans la table — la pastille `.tag` des
 * maquettes, dont elle reprend les deux couleurs sémantiques.
 *
 * « Archivée » et non « Inactive » comme sur les maquettes : c'est le mot du modèle, celui de
 * l'action qui y mène et celui du sélecteur du panneau. Deux vocabulaires pour un même état
 * finissent par désigner deux choses différentes. L'écart est à reporter au projet Claude Design.
 *
 * La couleur ne porte pas l'information seule — le mot est là, ce qui est ce que demande le
 * critère de non-dépendance à la couleur.
 */
export function StatusTag({ status }: { status: ReferenceStatus }): ReactNode {
  const archived = status === 'archived'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-xs font-semibold',
        archived
          ? 'bg-status-archived-surface text-status-archived-ink'
          : 'bg-status-active-surface text-status-active-ink',
      )}
    >
      {archived ? 'Archivée' : 'Active'}
    </span>
  )
}

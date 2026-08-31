import type { ReactNode } from 'react'
import { cn } from '@lehub/shared/lib/cn'
import type { ReferenceStatus } from '@/lib/api'

const OPTIONS: readonly { value: ReferenceStatus; label: string; selected: string }[] = [
  {
    value: 'active',
    label: 'Active',
    selected: 'bg-status-active-surface text-status-active-ink',
  },
  {
    value: 'archived',
    label: 'Archivée',
    selected: 'bg-status-archived-surface text-status-archived-ink',
  },
]

/**
 * Le statut, en sélecteur segmenté — la forme des maquettes, reprise de `.segmented` / `.seg`.
 *
 * Pleine largeur, deux cellules de 42 px séparées d'un filet, chacune précédée d'une pastille
 * ronde qui s'allume quand l'option est retenue. Ce point n'est pas un ornement : c'est ce qui
 * distingue les deux états autrement que par la couleur, et il porte `currentColor`, donc il
 * suit l'encre de l'option.
 *
 * Les couleurs sont sémantiques et non primaires — vert pour actif, ardoise pour archivé — ce
 * qui les accorde à la pastille de la table. Un bleu primaire aurait dit « sélectionné » sans
 * rien dire de *quel* état.
 *
 * `radiogroup` et non un groupe de boutons quelconque : les deux valeurs s'excluent, et c'est ce
 * rôle qui le fait annoncer comme un choix parmi deux plutôt que comme deux commandes
 * indépendantes. `aria-checked` porte l'état ; la couleur et la pastille ne font que le redire.
 */
export function StatusField({
  value,
  onChange,
}: {
  value: ReferenceStatus
  onChange: (status: ReferenceStatus) => void
}): ReactNode {
  return (
    <div className="flex flex-col gap-1.5">
      <span id="status-label" className="text-[0.8125rem] font-semibold text-ink">
        Statut
      </span>

      <div
        role="radiogroup"
        aria-labelledby="status-label"
        className="inline-flex w-full overflow-hidden rounded-[10px] border border-primary/12 bg-white"
      >
        {OPTIONS.map((option, index) => {
          const checked = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => {
                onChange(option.value)
              }}
              className={cn(
                'flex min-h-[42px] flex-1 items-center justify-center gap-2 px-4 text-sm font-semibold transition-colors',
                index === 0 && 'border-r border-primary/12',
                checked ? option.selected : 'text-ink-muted hover:bg-surface-hover hover:text-ink-body',
              )}
            >
              <span
                aria-hidden="true"
                className={cn('size-2 rounded-full bg-current', checked ? 'opacity-100' : 'opacity-35')}
              />
              {option.label}
            </button>
          )
        })}
      </div>

      <p className="text-[0.8125rem] text-ink-muted">
        Une entrée archivée n’est plus proposée au rattachement d’un évènement ni dans les filtres
        du site public. Les rattachements existants sont conservés.
      </p>
    </div>
  )
}

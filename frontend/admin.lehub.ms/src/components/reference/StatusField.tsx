import type { ReactNode } from 'react'
import { cn } from '@lehub/shared/lib/cn'
import type { ReferenceStatus } from '@/lib/api'

const OPTIONS: readonly { value: ReferenceStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archivée' },
]

/**
 * Le statut, en deux boutons plutôt qu'en case à cocher.
 *
 * `radiogroup` et non un groupe de boutons quelconque : les deux valeurs s'excluent, et c'est ce
 * rôle qui le fait annoncer comme un choix parmi deux plutôt que comme deux commandes
 * indépendantes. `aria-checked` porte l'état, la couleur ne fait que le redire.
 */
export function StatusField({
  value,
  onChange,
}: {
  value: ReferenceStatus
  onChange: (status: ReferenceStatus) => void
}): ReactNode {
  return (
    <div>
      <span id="status-label" className="font-heading text-[0.8125rem] font-semibold text-ink">
        Statut
      </span>
      <div
        role="radiogroup"
        aria-labelledby="status-label"
        className="mt-1.5 inline-flex rounded-[10px] border-[1.5px] border-[#e2e8f0] p-0.5"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => {
              onChange(option.value)
            }}
            className={cn(
              'min-h-9 rounded-lg px-4 text-[0.8125rem] font-semibold transition-colors',
              value === option.value
                ? 'bg-primary text-white'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[0.8125rem] text-ink-muted">
        Une entrée archivée n’est plus proposée au rattachement d’un évènement ni dans les filtres
        du site public. Les rattachements existants sont conservés.
      </p>
    </div>
  )
}

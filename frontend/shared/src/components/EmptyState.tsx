import type { MouseEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button } from './Button'

interface EmptyStateAction {
  label: string
  /** Reçoit l'évènement, pour l'appelant qui a besoin du bouton lui-même — restitution du focus. */
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: EmptyStateAction
}

/** Informative "nothing here" panel — no events at all, no events match the active filters. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="glass flex flex-col items-center gap-4 rounded-[20px] px-6 py-16 text-center">
      <Icon aria-hidden="true" className="size-12 text-ink-muted/50" strokeWidth={1.5} />
      <p className="max-w-sm text-lg font-semibold text-ink-body">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && (
        <Button variant="outline" className="mt-2 rounded-full" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

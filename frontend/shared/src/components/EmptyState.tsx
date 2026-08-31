import type { MouseEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button } from './Button'
import { LinkButton } from './LinkButton'

/**
 * Ce que l'état vide propose de faire — un geste, ou une destination.
 *
 * Une union et non deux propriétés facultatives : une action sans ni l'une ni l'autre n'a pas de
 * sens, et le type est ce qui l'interdit. La distinction n'est pas cosmétique — un écran de
 * référentiel ouvre un tiroir sur place, la liste des évènements mène à une autre adresse, et
 * une navigation déguisée en bouton perd le clic du milieu, le « ouvrir dans un onglet » et
 * l'annonce du rôle de lien.
 */
type EmptyStateAction =
  | {
      label: string
      /** Reçoit l'évènement, pour l'appelant qui a besoin du bouton lui-même — restitution du focus. */
      onClick: (event: MouseEvent<HTMLButtonElement>) => void
    }
  | { label: string; to: string }

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
      {action &&
        ('to' in action ? (
          <LinkButton variant="outline" to={action.to} className="mt-2 rounded-full">
            {action.label}
          </LinkButton>
        ) : (
          <Button variant="outline" className="mt-2 rounded-full" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  )
}

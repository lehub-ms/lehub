import type { ReactNode } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { cn } from '@lehub/shared/lib/cn'
import { BUTTON_BASE, BUTTON_VARIANTS } from '@lehub/shared/lib/button-styles'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  /** L'intitulé de l'action, qui doit dire ce qu'elle fait : « Supprimer », « Archiver ». */
  confirmLabel: string
  /** Rouge et focus sur « Annuler » : réservé à ce qui ne se répare pas. */
  destructive?: boolean
  onConfirm: () => void
  pending?: boolean
}

/**
 * La confirmation d'une action qu'on ne veut pas déclencher par mégarde.
 *
 * Sur `AlertDialog` de Radix et non sur `Dialog`, et la différence n'est pas cosmétique. Il pose
 * `role="alertdialog"`, qui est ce que les maquettes demandent ; il focalise l'action *sûre* par
 * défaut ; et il refuse de se fermer sur un clic à côté, ce qu'une confirmation destructive doit
 * refuser. Reproduire ces trois choses sur `Dialog`, c'est réécrire le composant.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
  pending,
}: ConfirmDialogProps): ReactNode {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-[2px]" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-[70] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl focus:outline-none">
          <AlertDialog.Title className="font-heading text-lg font-bold text-ink">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
              {description}
            </div>
          </AlertDialog.Description>

          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Cancel
              className={cn(BUTTON_BASE, 'text-ink-muted hover:bg-slate-100 hover:text-ink')}
            >
              Annuler
            </AlertDialog.Cancel>
            <AlertDialog.Action
              disabled={pending}
              onClick={(event) => {
                // La fermeture est décidée par l'appelant : un refus du serveur doit pouvoir
                // laisser la modale ouverte et changer ce qu'elle dit.
                event.preventDefault()
                onConfirm()
              }}
              className={cn(
                BUTTON_BASE,
                destructive
                  ? 'bg-[#b91c1c] text-white hover:bg-[#991b1b]'
                  : BUTTON_VARIANTS.primary,
                pending && 'cursor-not-allowed opacity-60',
              )}
            >
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

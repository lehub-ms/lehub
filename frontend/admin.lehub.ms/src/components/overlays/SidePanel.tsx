import type { ReactNode, RefObject } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

interface SidePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
  /**
   * Ce qui reprend le focus à la fermeture.
   *
   * Radix le fait de lui-même quand le tiroir s'ouvre depuis un `Dialog.Trigger`. Ici il s'ouvre
   * depuis un bouton de ligne, hors de son arbre, et la restauration automatique laisse le focus
   * sur `<body>` — une personne au clavier se retrouve alors en haut du document, à retraverser
   * toute la table pour revenir où elle était. Le déclencheur est donc désigné explicitement.
   */
  restoreFocusTo?: RefObject<HTMLElement | null>
}

/**
 * Le tiroir latéral du backoffice : celui qui sert à créer comme à modifier.
 *
 * Sur `Dialog` de Radix, comme le tiroir mobile de la coquille, et pour la même raison écrite
 * là-bas : le piège à focus, la fermeture par la touche d'échappement, le clic sur le fond, le
 * retour du focus au déclencheur et `aria-modal` viennent du primitif. Les réécrire à la main,
 * c'est prendre le risque d'en oublier un — et celui qu'on oublie ne se voit pas à l'œil.
 *
 * Admin-local et non dans le socle : le site public a bien un tiroir, mais c'est un autre, et
 * le remonter demanderait de reprendre celui-là. Écrit sans rien savoir du backoffice pour que
 * cette promotion reste un déplacement de fichier le jour où elle se justifie.
 */
export function SidePanel({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  footer,
  restoreFocusTo,
}: SidePanelProps): ReactNode {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl focus:outline-none"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            const trigger = restoreFocusTo?.current
            if (!trigger) return
            event.preventDefault()
            trigger.focus()
          }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
            <div className="min-w-0">
              <Dialog.Title className="font-heading text-lg font-bold text-ink">
                {title}
              </Dialog.Title>
              <p className="mt-0.5 truncate text-[0.8125rem] text-ink-muted">{subtitle}</p>
            </div>
            <Dialog.Close
              // 44px : le plancher tactile, ici comme sur les actions de ligne.
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-slate-100 hover:text-ink"
              aria-label="Fermer"
            >
              <X aria-hidden="true" className="size-[18px]" />
            </Dialog.Close>
          </div>

          {/* Le corps défile, l'en-tête et le pied restent : sur un écran court, « Enregistrer »
              ne doit pas se trouver hors de portée. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

          <div className="flex items-center gap-3 border-t border-slate-200 px-6 py-4">{footer}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

import { useState, type ReactNode } from 'react'
import { ConfirmDialog } from '@/components/overlays/ConfirmDialog'
import { ApiError, deleteEvent } from '@/lib/api'

interface DeleteEventDialogProps {
  /** L'évènement visé, ou `null` quand rien n'est en attente de confirmation. */
  event: { id: string; title: string } | null
  onOpenChange: (open: boolean) => void
  /** Appelé une fois la suppression aboutie. La liste y reste, le formulaire y revient. */
  onDeleted: () => void
}

/**
 * La confirmation de suppression d'un évènement, partagée par la liste et par le formulaire.
 *
 * Un seul composant pour les deux écrans, parce que #149 demande la même confirmation aux deux
 * endroits — elle nomme l'évènement, annonce le retrait de lehub.ms et le caractère définitif —
 * et que deux copies auraient divergé sur la formulation au premier ajustement. Ce qui diffère
 * est ce qui *suit* la suppression, et c'est précisément ce que `onDeleted` laisse décider à
 * l'appelant : la liste reste en place, le formulaire ramène à la liste.
 *
 * `ConfirmDialog` s'appuie sur `AlertDialog` de Radix : `role="alertdialog"`, fermeture par
 * Échap et par le fond, et **focus par défaut sur l'action sûre**. « L'action par défaut n'est
 * pas destructrice » (#149) est donc tenu par le composant, pas par une précaution ici.
 */
export function DeleteEventDialog({
  event,
  onOpenChange,
  onDeleted,
}: DeleteEventDialogProps): ReactNode {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm(): Promise<void> {
    if (!event) return

    setPending(true)
    setError(null)
    try {
      await deleteEvent(event.id)
      onDeleted()
      onOpenChange(false)
    } catch (cause) {
      setError(messageFor(cause))
    } finally {
      setPending(false)
    }
  }

  return (
    <ConfirmDialog
      open={event !== null}
      onOpenChange={(open) => {
        if (!open) setError(null)
        onOpenChange(open)
      }}
      title="Supprimer cet évènement ?"
      description={
        <>
          <strong className="font-semibold text-ink">{event?.title}</strong> sera retiré de
          lehub.ms. Cette action est définitive.
          {error ? (
            <span role="alert" className="mt-2 block text-[#b91c1c]">
              {error}
            </span>
          ) : null}
        </>
      }
      confirmLabel="Supprimer"
      destructive
      pending={pending}
      onConfirm={() => {
        void confirm()
      }}
    />
  )
}

/** Les refus du serveur, dits en français — le contrat n'en porte que le code. */
function messageFor(cause: unknown): string {
  if (!(cause instanceof ApiError)) return 'La suppression a échoué. Réessayez.'

  switch (cause.code) {
    case 'EVENT_NOT_FOUND':
      // L'edge case de #149 : déjà supprimé depuis un autre onglet. Un message explicite, pas
      // une erreur brute.
      return 'Cet évènement a déjà été supprimé.'
    case 'FORBIDDEN':
      return 'Vous n’êtes pas autorisé à supprimer cet évènement.'
    default:
      return 'La suppression a échoué. Réessayez.'
  }
}

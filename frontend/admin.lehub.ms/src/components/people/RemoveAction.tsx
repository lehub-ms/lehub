import { useRef, useState, type ReactNode } from 'react'
import { UserMinus } from 'lucide-react'
import { ConfirmDialog } from '@/components/overlays/ConfirmDialog'
import { ApiError, type Account } from '@/lib/api'

export interface RemovalCopy {
  /** « Retirer cet organisateur ? » */
  title: string
  /** Ce que la personne perd. Reçoit son nom, déjà mis en évidence. */
  consequence: (name: ReactNode) => ReactNode
  /** Ce que l'on perd soi-même. Aucun nom : c'est de soi qu'il s'agit. */
  selfConsequence: ReactNode
}

interface RemoveActionProps {
  person: Account
  /** Vrai quand la ligne est celle de la session : la confirmation change alors de discours. */
  isSelf: boolean
  copy: RemovalCopy
  onRemove: () => Promise<void>
}

/**
 * Le retrait d'une habilitation, confirmé.
 *
 * Trois choses que la maquette ne dit pas et que les stories exigent, réunies ici parce
 * qu'elles ne diffèrent que par leurs textes :
 *
 * - la confirmation **nomme la personne** et rappelle que son compte LeHub n'est pas supprimé —
 *   c'est la crainte que le geste inspire, et la lever fait partie du geste ;
 * - se retirer soi-même est permis mais tient un autre discours : la perte d'accès est annoncée
 *   avant, pas découverte à la requête suivante ;
 * - un refus du serveur — le dernier administrateur (#159), une habilitation perdue en cours de
 *   session — s'affiche **dans la modale, qui reste ouverte**, plutôt que de la fermer sur un
 *   échec muet. Même choix que `DeleteAction`, pour la même raison : avalé, l'échec laissait
 *   recliquer sans rien apprendre.
 *
 * `AlertDialog` de Radix via `ConfirmDialog` : `role="alertdialog"`, le focus sur l'action sûre,
 * et le refus de se fermer sur un clic à côté.
 */
export function RemoveAction({ person, isSelf, copy, onRemove }: RemoveActionProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  const name = `${person.givenName} ${person.surname}`

  async function run(): Promise<void> {
    setPending(true)
    setError(null)
    try {
      await onRemove()
      setOpen(false)
    } catch (cause) {
      setError(refusal(cause))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        // 34 px comme la maquette sur un écran pointé, 44 px sur mobile : la maquette passe sous
        // le plancher tactile des non-négociables, et le point de rupture réconcilie les deux.
        className="flex size-11 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-[#b91c1c]/8 hover:text-[#b91c1c] sm:size-[34px]"
        aria-label={isSelf ? `Me retirer, ${name}` : `Retirer ${name}`}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        <UserMinus aria-hidden="true" className="size-4" />
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          // Radix rend le focus au déclencheur de lui-même quand la modale s'ouvre depuis un
          // `Trigger` ; celle-ci s'ouvre depuis un bouton de ligne, hors de son arbre.
          if (!next) trigger.current?.focus()
        }}
        title={copy.title}
        confirmLabel="Retirer"
        destructive
        pending={pending}
        onConfirm={() => void run()}
        description={
          <>
            {error ? (
              <p role="alert" className="mb-3 font-semibold text-[#b91c1c]">
                {error}
              </p>
            ) : null}
            {isSelf ? (
              copy.selfConsequence
            ) : (
              <>{copy.consequence(<strong className="text-ink">{name}</strong>)}</>
            )}
          </>
        }
      />
    </>
  )
}

/**
 * Ce qu'on dit d'un refus.
 *
 * `LAST_GLOBAL_ADMIN` est nommé ici plutôt que dans l'écran des administrateurs, parce que c'est
 * la modale qui doit l'afficher et qu'elle est la même des deux côtés. Le message donne la
 * raison — un backoffice sans administrateur n'est plus administrable — et la sortie.
 */
function refusal(cause: unknown): string {
  if (cause instanceof ApiError && cause.code === 'LAST_GLOBAL_ADMIN') {
    return 'Impossible de retirer le dernier administrateur : le backoffice deviendrait inadministrable. Désignez d’abord un autre administrateur.'
  }
  if (cause instanceof ApiError && cause.status === 403) {
    return 'Vous n’êtes plus autorisé à faire cela. Reconnectez-vous.'
  }
  return 'Le retrait a échoué. Réessayez.'
}

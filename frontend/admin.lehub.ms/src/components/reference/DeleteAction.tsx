import { useState, type ReactNode } from 'react'
import { ApiError } from '@/lib/api'
import { ConfirmDialog } from '@/components/overlays/ConfirmDialog'

interface DeleteActionProps {
  /** Le nom de l'entrée, que la confirmation doit prononcer. */
  name: string
  /** « la communauté » / « la technologie », pour composer les phrases. */
  determiner: string
  /** Évènements rattachés au dernier chargement. Décide de la variante proposée. */
  eventCount: number
  /** Désignations d'organisateur, supprimées avec la communauté. Absent pour une technologie. */
  organizerCount?: number
  onDelete: () => Promise<void>
  onArchive: () => Promise<void>
}

/**
 * La suppression définitive, et ce qu'on propose à sa place quand elle est impossible.
 *
 * Deux variantes de la même modale, choisies sur le compte d'évènements que la liste porte déjà :
 * la suppression n'est **offerte** que pour une entrée qu'aucun évènement ne référence, et
 * l'autre variante nomme le nombre et propose l'archivage. C'est ce que #155 demande, et les deux
 * moitiés sont vraies en même temps.
 *
 * Le compte affiché peut avoir vieilli — un évènement rattaché entre-temps. C'est la course que
 * la story décrit : le serveur répond alors 409 avec le nombre à jour, et la modale bascule sur
 * place au lieu de se fermer sur un échec muet.
 */
export function DeleteAction({
  name,
  determiner,
  eventCount,
  organizerCount,
  onDelete,
  onArchive,
}: DeleteActionProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  // Rechargé depuis le refus du serveur quand la course a eu lieu.
  const [referenced, setReferenced] = useState(eventCount)
  const [error, setError] = useState<string | null>(null)

  const blocked = referenced > 0

  async function run(action: () => Promise<void>): Promise<void> {
    setPending(true)
    setError(null)
    try {
      await action()
      setOpen(false)
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'REFERENCE_IN_USE') {
        // La modale reste ouverte et change de variante : « l'écran restitue le refus ». Le
        // nombre vient du corps du 409, pas d'une supposition.
        const count = cause.body?.['eventCount']
        setReferenced(typeof count === 'number' ? count : 1)
      } else {
        // Tout le reste — 500, coupure réseau, habilitation perdue en cours de session — doit se
        // voir. Avalé, l'échec laissait la modale inchangée : on recliquait sans rien apprendre,
        // en croyant l'entrée supprimée.
        setError(
          cause instanceof ApiError && cause.status === 403
            ? 'Vous n’êtes plus autorisé à faire cela. Reconnectez-vous.'
            : 'L’opération a échoué. Réessayez.',
        )
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setReferenced(eventCount)
          setError(null)
          setOpen(true)
        }}
        className="min-h-11 rounded-lg px-3 text-[0.9375rem] font-semibold text-[#b91c1c] transition-colors hover:bg-[#b91c1c]/8"
      >
        Supprimer
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={blocked ? 'Suppression impossible' : `Supprimer ${determiner} ?`}
        confirmLabel={blocked ? 'Archiver' : 'Supprimer'}
        destructive={!blocked}
        pending={pending}
        onConfirm={() => void run(blocked ? onArchive : onDelete)}
        description={
          <>
            {error ? (
              <p role="alert" className="mb-3 font-semibold text-[#b91c1c]">
                {error}
              </p>
            ) : null}
            {blocked ? (
            <>
              <strong className="text-ink">{name}</strong> est rattachée à{' '}
              {referenced === 1 ? 'un évènement' : `${String(referenced)} évènements`}. La
              suppression définitive n’est possible que pour une entrée qu’aucun évènement ne
              référence. Vous pouvez l’archiver : elle disparaîtra des propositions sans rompre
                les rattachements existants.
              </>
            ) : (
            <>
              <strong className="text-ink">{name}</strong> sera définitivement retirée du
              référentiel. Cette action est irréversible.
                {organizerCount !== undefined && organizerCount > 0 ? (
                  <>
                    {' '}
                    {organizerCount === 1
                      ? 'Une désignation d’organisateur sera également supprimée.'
                      : `${String(organizerCount)} désignations d’organisateur seront également supprimées.`}
                  </>
                ) : null}
              </>
            )}
          </>
        }
      />
    </>
  )
}

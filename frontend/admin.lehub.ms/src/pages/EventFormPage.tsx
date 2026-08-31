import { useCallback, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { ErrorState } from '@lehub/shared/components/ErrorState'
import { EventForm } from '@/components/events/EventForm'
import { EMPTY_DRAFT, type EventDraft, type EventFormValues } from '@/lib/eventDraft'
import { useSelectedCommunity } from '@/community/useSelectedCommunity'
import { useReferenceList } from '@/hooks/useReferenceList'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { ApiError, createEvent, listEventOptions, type EventOptions } from '@/lib/api'
import { communityPath } from '@/lib/navigation'

const LEAVE_MESSAGE =
  'Des modifications ne sont pas enregistrées. Quitter cette page les abandonnera.'

/**
 * Les refus de l'API, dits en français. Le contrat n'en porte que le code.
 *
 * `FORBIDDEN` est le cas de l'habilitation retirée entre l'ouverture du formulaire et
 * l'enregistrement — l'edge case de #145 — et la saisie reste à l'écran, ce que garantit le fait
 * que ce message ne provoque aucune navigation.
 */
function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return 'L’enregistrement a échoué. Réessayez.'

  switch (error.code) {
    case 'FORBIDDEN':
      return 'Vous n’êtes plus autorisé à publier pour cette communauté. Votre saisie est conservée.'
    case 'UNKNOWN_REFERENCE':
      return 'Une communauté, une technologie, un type ou un format sélectionné n’existe plus. Rechargez la page.'
    case 'INVALID_BODY':
      return 'Le formulaire contient une valeur que le serveur refuse.'
    default:
      return 'L’enregistrement a échoué. Réessayez.'
  }
}

/**
 * La création d'un évènement, sur sa route dédiée.
 *
 * Une route et non un tiroir, contrairement aux référentiels : « une adresse d'évènement se
 * partage, se met en favori et se recharge » (#143), et c'est aussi ce qui permettra d'y arriver
 * depuis ailleurs. Le fil d'ariane ramène à la liste, et il est la sortie normale.
 *
 * `useReferenceList` sert ici à lire les vocabulaires : ce n'est pas une liste de référentiel,
 * mais c'est exactement la même mécanique — une lecture par montage, un état d'erreur, un
 * rechargement — et lui en écrire une seconde ne changerait que le nom.
 */
export function EventFormPage(): ReactNode {
  const community = useSelectedCommunity()
  const navigate = useNavigate()

  const load = useCallback(async (): Promise<EventOptions[]> => [await listEventOptions()], [])
  const state = useReferenceList(load)
  const options = state.status === 'success' ? state.entries[0] : null

  const [draft, setDraft] = useState<EventDraft>(EMPTY_DRAFT)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const listPath = community ? communityPath(community.slug, 'evenements') : '..'

  /* Posée avant tout retour anticipé : un hook conditionnel est interdit, et la garde doit de
     toute façon valoir dès que la saisie a commencé. */
  const releaseGuard = useUnsavedChanges(dirty, LEAVE_MESSAGE)

  async function save(values: EventFormValues): Promise<void> {
    setPending(true)
    setSubmitError(null)
    try {
      await createEvent({
        ...values,
        bannerImagePath: null,
        /* La communauté sélectionnée est rattachée d'office : créer un évènement qu'on ne
           pourrait pas rouvrir n'aurait pas de sens (#145). Un administrateur global sans
           communauté sélectionnée en crée un sans rattachement, ce que l'API accepte de lui
           seul. Le choix d'autres communautés arrive avec #147. */
        communityIds: community ? [community.id] : [],
        technologyIds: [],
      })
      // Désarmée **avant** de naviguer. `setDirty(false)` seul ne suffit pas : la garde
      // interroge sa condition de façon synchrone, avant que l'état n'ait été propagé, et
      // demanderait confirmation d'un abandon qui n'en est pas un.
      setDirty(false)
      releaseGuard()
      await navigate(listPath)
    } catch (error) {
      setSubmitError(messageFor(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <nav aria-label="Fil d’ariane" className="text-[0.8125rem] text-ink-muted">
        <Link to={listPath} className="font-semibold text-primary hover:underline">
          Évènements
        </Link>
        <span aria-hidden="true" className="px-2">
          /
        </span>
        <span>Nouvel évènement</span>
      </nav>

      <h1 className="mt-3 text-2xl font-bold">Nouvel évènement</h1>
      <p className="mt-2 mb-8 text-[0.9375rem] text-ink-muted">
        Renseignez les informations : elles seront publiées sur lehub.ms.
      </p>

      {state.status === 'loading' ? (
        <p role="status" className="text-[0.9375rem] text-ink-muted">
          Chargement…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <ErrorState
          title="Impossible de charger les types et les formats"
          error={state.error}
          onRetry={state.refetch}
        />
      ) : null}

      {options ? (
        <EventForm
          draft={draft}
          onDraftChange={(next) => {
            setDraft(next)
            setDirty(true)
          }}
          options={options}
          submitError={submitError}
          pending={pending}
          submitLabel="Enregistrer"
          onSubmit={(values) => {
            void save(values)
          }}
          onCancel={() => {
            void navigate(listPath)
          }}
        />
      ) : null}
    </>
  )
}

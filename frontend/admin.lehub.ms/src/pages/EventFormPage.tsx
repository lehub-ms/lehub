import { useCallback, useState, type ReactNode } from 'react'
import { CalendarX } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { EmptyState } from '@lehub/shared/components/EmptyState'
import { ErrorState } from '@lehub/shared/components/ErrorState'
import { EventForm } from '@/components/events/EventForm'
import { EMPTY_DRAFT, type EventDraft, type EventFormValues } from '@/lib/eventDraft'
import { useSelectedCommunity } from '@/community/useSelectedCommunity'
import { useReferenceList } from '@/hooks/useReferenceList'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import {
  ApiError,
  createEvent,
  getEvent,
  listEventOptions,
  updateEvent,
  type AdminEvent,
  type EventOptions,
} from '@/lib/api'
import { toLocalInput } from '@/lib/eventDates'
import { communityPath } from '@/lib/navigation'

const LEAVE_MESSAGE =
  'Des modifications ne sont pas enregistrées. Quitter cette page les abandonnera.'

/** Ce que la page a besoin de lire avant de s'afficher. `event` est nul en création. */
interface FormData {
  options: EventOptions
  event: AdminEvent | null
}

/**
 * Un identifiant qui ne correspond à aucun évènement.
 *
 * Deux réponses le disent : le 404 de la route, et le 400 qu'elle oppose à un identifiant
 * malformé — une adresse tapée de travers n'est pas plus un évènement qu'une adresse périmée, et
 * l'écran a la même chose à en dire. Tout le reste est une vraie panne, et se présente comme
 * telle.
 */
function isMissing(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  return error.code === 'EVENT_NOT_FOUND' || error.code === 'INVALID_ROUTE_PARAMETER'
}

/** Les refus de l'API, dits en français. Le contrat n'en porte que le code. */
function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return 'L’enregistrement a échoué. Réessayez.'

  switch (error.code) {
    case 'FORBIDDEN':
      return 'Vous n’êtes plus autorisé à modifier cet évènement. Votre saisie est conservée.'
    case 'EVENT_NOT_FOUND':
      // L'edge case de #146 : supprimé depuis un autre onglet pendant l'édition. L'écriture
      // échoue plutôt que de recréer l'évènement, et le dit.
      return 'Cet évènement n’existe plus : il a été supprimé pendant que vous le modifiiez.'
    case 'UNKNOWN_REFERENCE':
      return 'Une valeur sélectionnée n’existe plus. Rechargez la page.'
    case 'INVALID_DATE_RANGE':
      return 'La date de fin ne peut pas précéder la date de début.'
    case 'INVALID_BODY':
      return 'Le formulaire contient une valeur que le serveur refuse.'
    default:
      return 'L’enregistrement a échoué. Réessayez.'
  }
}

/** Le brouillon initial : vide en création, l'évènement converti en heure de Paris en édition. */
function draftFor(event: AdminEvent | null): EventDraft {
  if (!event) return EMPTY_DRAFT

  return {
    title: event.title,
    description: event.description ?? '',
    startLocal: toLocalInput(event.startDate),
    endLocal: toLocalInput(event.endDate),
    formatTypeId: event.formatTypeId,
    eventModeId: event.eventModeId,
  }
}

/**
 * Le formulaire d'un évènement, en création comme en modification.
 *
 * Un seul écran pour les deux, la présence de `:eventId` dans la route faisant toute la
 * différence : les blocs, la barre d'action et les règles de validation sont les mêmes, et #146
 * demande explicitement que ces dernières s'appliquent « à l'identique ». Deux composants
 * jumeaux les auraient laissées diverger au premier ajustement.
 *
 * Une route et non un tiroir, contrairement aux référentiels : « une adresse d'évènement se
 * partage, se met en favori et se recharge » (#143).
 */
export function EventFormPage(): ReactNode {
  const { eventId } = useParams()
  const community = useSelectedCommunity()
  const navigate = useNavigate()

  const load = useCallback(async (): Promise<FormData[]> => {
    // En parallèle : les deux lectures sont indépendantes, et les enchaîner doublerait
    // l'attente devant un formulaire vide.
    const [options, event] = await Promise.all([
      listEventOptions(),
      eventId ? getEvent(eventId) : Promise.resolve(null),
    ])
    return [{ options, event }]
  }, [eventId])
  const state = useReferenceList(load)
  const data = state.status === 'success' ? (state.entries[0] ?? null) : null

  /* Le préremplissage se fait **au rendu**, quand le lot lu change d'identité — jamais dans un
     effet, que `react-hooks/set-state-in-effect` refuse à juste titre. C'est le patron que React
     documente pour dériver un état d'une valeur qui change, et celui que `ReferenceScreen`
     emploie déjà pour son repli pendant la recherche. */
  const [draft, setDraft] = useState<EventDraft>(EMPTY_DRAFT)
  const [seen, setSeen] = useState<FormData | null>(null)
  if (data && seen !== data) {
    setSeen(data)
    setDraft(draftFor(data.event))
  }

  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const listPath = community ? communityPath(community.slug, 'evenements') : '..'
  const releaseGuard = useUnsavedChanges(dirty, LEAVE_MESSAGE)

  const stored = seen?.event ?? null
  const heading = stored ? stored.title : 'Nouvel évènement'

  async function save(values: EventFormValues): Promise<void> {
    setPending(true)
    setSubmitError(null)
    try {
      if (stored) {
        // Les six champs que ce formulaire possède, et eux seuls : la bannière (#148) et les
        // rattachements (#147) ne sont pas envoyés, donc pas touchés.
        await updateEvent(stored.id, values)
      } else {
        await createEvent({
          ...values,
          bannerImagePath: null,
          /* La communauté sélectionnée est rattachée d'office : créer un évènement qu'on ne
             pourrait pas rouvrir n'aurait pas de sens (#145). Le choix d'autres communautés
             arrive avec #147. */
          communityIds: community ? [community.id] : [],
          technologyIds: [],
        })
      }
      // Désarmée **avant** de naviguer. `setDirty(false)` seul ne suffit pas : la garde
      // interroge sa condition de façon synchrone, avant que l'état n'ait été propagé.
      setDirty(false)
      releaseGuard()
      await navigate(listPath)
    } catch (error) {
      setSubmitError(messageFor(error))
    } finally {
      setPending(false)
    }
  }

  // Un identifiant inconnu n'est ni une page blanche ni une erreur brute (#146).
  if (state.status === 'error' && isMissing(state.error)) {
    return (
      <EmptyState
        icon={CalendarX}
        title="Cet évènement n’existe plus"
        description="Il a peut-être été supprimé depuis que ce lien a été partagé."
        action={{ label: 'Retour à la liste', to: listPath }}
      />
    )
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
        <span>{heading}</span>
      </nav>

      <h1 className="mt-3 text-2xl font-bold">{heading}</h1>
      <p className="mt-2 mb-8 text-[0.9375rem] text-ink-muted">
        {stored
          ? 'Les modifications sont publiées sur lehub.ms dès l’enregistrement.'
          : 'Renseignez les informations : elles seront publiées sur lehub.ms.'}
      </p>

      {state.status === 'loading' ? (
        <p role="status" className="text-[0.9375rem] text-ink-muted">
          Chargement…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <ErrorState
          title="Impossible de charger le formulaire"
          error={state.error}
          onRetry={state.refetch}
        />
      ) : null}

      {data ? (
        <EventForm
          draft={draft}
          onDraftChange={(next) => {
            setDraft(next)
            setDirty(true)
          }}
          options={data.options}
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

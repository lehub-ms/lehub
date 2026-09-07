import type { ReactNode } from 'react'
import { ArrowRight, Star } from 'lucide-react'
import { Link } from 'react-router'
import { CommunityAvatar } from '@lehub/shared/components/entities/CommunityAvatar'
import { TechnologyAvatar } from '@lehub/shared/components/entities/TechnologyAvatar'
import { useEventPreferences } from '@/hooks/useEventPreferences'
import type { NamedRef } from '@/lib/api'
import { PATHS, PREFERENCES_ANCHOR } from '@/lib/navigation'

/**
 * Le récapitulatif de ce que LeHub a retenu — en lecture seule, et strictement.
 *
 * Aucun contrôle de modification n'est rendu ici : la sélection se règle sur la page Évènements,
 * et un lien y renvoie. Deux endroits pour régler la même chose finiraient par diverger, et
 * l'utilisateur ne saurait plus lequel alimente son agenda.
 *
 * Rien n'y mentionne le lien d'agenda non plus. Les maquettes portent ici sa copie, sa
 * régénération et une zone de suppression ; tant que la Feature « Mon lien d'agenda iCal » n'est
 * pas livrée, en promettre quoi que ce soit serait un bouton mort.
 */
export function PreferencesCard() {
  const { state } = useEventPreferences()

  return (
    <section
      id={PREFERENCES_ANCHOR}
      aria-labelledby={`${PREFERENCES_ANCHOR}-titre`}
      // La navigation est fixe : sans cette marge de défilement, une ancre profonde poserait le
      // haut de la carte dessous.
      className="glass scroll-mt-28 rounded-[20px] px-6 py-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2
            id={`${PREFERENCES_ANCHOR}-titre`}
            className="flex items-center gap-2 font-heading text-xl font-bold text-ink"
          >
            <Star aria-hidden="true" className="size-[18px] shrink-0 fill-primary text-primary" />
            Mes préférences
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Les communautés et technologies que vous suivez. C’est ce que votre agenda reçoit.
          </p>
        </div>

        <Link
          to={PATHS.events}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-primary hover:underline"
        >
          Modifier sur la page Évènements
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      <div className="mt-5">
        <Body state={state} />
      </div>
    </section>
  )
}

function Body({ state }: { state: ReturnType<typeof useEventPreferences>['state'] }): ReactNode {
  if (state.status === 'loading') {
    return <p className="text-sm text-ink-muted">Chargement…</p>
  }

  // La page est déjà sous garde de session : hors session on n'arrive pas ici. L'état reste
  // traité plutôt que forcé, parce qu'un rendu ne doit rien affirmer qu'il ne sait pas.
  if (state.status === 'anonymous' || state.status === 'error') {
    return (
      <p role="status" className="text-sm text-ink-muted">
        Vos préférences n’ont pas pu être chargées.
      </p>
    )
  }

  const { saved, communities, technologies } = state.preferences

  if (!saved) {
    return (
      <p className="text-sm text-ink-muted">
        Aucune préférence enregistrée. Choisissez vos filtres sur la page Évènements, puis
        enregistrez-les.
      </p>
    )
  }

  // Enregistrée vide, la sélection *vaut* « tous les évènements ». Deux listes vides le
  // laisseraient croire à une perte de données.
  if (communities.length === 0 && technologies.length === 0) {
    return (
      <p className="inline-flex items-center rounded-full bg-status-active-surface px-3 py-1 text-sm font-semibold text-status-active-ink">
        Tous les évènements
      </p>
    )
  }

  return (
    <dl className="flex flex-col gap-4">
      {communities.length > 0 && (
        <Dimension label="Communautés">
          {communities.map((entry) => (
            <Chip key={entry.id} entry={entry} mark={<CommunityAvatar community={entry} size={22} hidden />} />
          ))}
        </Dimension>
      )}
      {technologies.length > 0 && (
        <Dimension label="Technologies">
          {technologies.map((entry) => (
            <Chip key={entry.id} entry={entry} mark={<TechnologyAvatar technology={entry} size={22} hidden />} />
          ))}
        </Dimension>
      )}
    </dl>
  )
}

function Dimension({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="mb-2 text-[0.6875rem] font-bold tracking-[0.08em] text-ink-muted uppercase">
        {label}
      </dt>
      {/* `flex-wrap` et non un défilement : une sélection longue passe à la ligne, de 320px à
          1920px, sans jamais pousser la page horizontalement. */}
      <dd className="flex flex-wrap gap-2">{children}</dd>
    </div>
  )
}

/**
 * Une entrée suivie, avec sa marque plutôt qu'avec son seul nom — le logo quand il existe,
 * l'initiale à défaut, exactement comme dans les filtres (#84).
 *
 * Une entrée archivée pas encore purgée reste affichée, et le dit : elle vaut mieux qu'un trou
 * silencieux dans ce que l'utilisateur croit suivre.
 */
function Chip({ entry, mark }: { entry: NamedRef; mark: ReactNode }) {
  const archived = entry.archived === true

  return (
    <span
      className={
        archived
          ? 'inline-flex items-center gap-2 rounded-full bg-status-archived-surface px-3 py-1.5 text-sm text-status-archived-ink'
          : 'inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-sm text-ink-body'
      }
    >
      {mark}
      {entry.name}
      {archived && <span className="sr-only">(archivée)</span>}
    </span>
  )
}

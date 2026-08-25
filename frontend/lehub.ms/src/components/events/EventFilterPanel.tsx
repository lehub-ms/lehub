import type { EventFilterSelection, FilterOptionsData } from '@/lib/eventFilters'
import { CommunityAvatar } from './CommunityAvatar'
import { FilterCheckboxRow } from './FilterCheckboxRow'
import { TechnologyAvatar } from './TechnologyAvatar'

interface EventFilterPanelProps {
  options: FilterOptionsData
  selection: EventFilterSelection
  onChange: (next: EventFilterSelection) => void
  onReset: () => void
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]
}

/**
 * Desktop sticky panel — both dimensions shown flat, not an accordion (the mock reserves
 * the accordion for the space-constrained mobile drawer).
 */
export function EventFilterPanel({ options, selection, onChange, onReset }: EventFilterPanelProps) {
  if (options.communities.length === 0 && options.technologies.length === 0) return null

  return (
    <aside
      aria-label="Filtres"
      className="glass-strong hidden w-[260px] shrink-0 flex-col rounded-[20px] p-6 lg:sticky lg:top-24 lg:flex lg:self-start"
    >
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold text-ink">Filtres</h2>
        <button
          type="button"
          onClick={onReset}
          className="min-h-11 text-[0.8125rem] text-primary underline hover:no-underline"
        >
          Réinitialiser
        </button>
      </div>

      {options.communities.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-[0.6875rem] font-bold tracking-[0.08em] text-ink-muted uppercase">
            Communauté
          </p>
          <div className="flex flex-col gap-0.5">
            {options.communities.map((community) => (
              <FilterCheckboxRow
                key={community.id}
                id={community.id}
                label={community.name}
                checked={selection.communityIds.includes(community.id)}
                onChange={() => {
                  onChange({
                    ...selection,
                    communityIds: toggleId(selection.communityIds, community.id),
                  })
                }}
                leading={<CommunityAvatar community={community} size={22} hidden />}
              />
            ))}
          </div>
        </div>
      )}

      {options.communities.length > 0 && options.technologies.length > 0 && (
        <hr className="mb-5 border-primary/10" />
      )}

      {options.technologies.length > 0 && (
        <div>
          <p className="mb-2 text-[0.6875rem] font-bold tracking-[0.08em] text-ink-muted uppercase">
            Technologie
          </p>
          <div className="flex flex-col gap-0.5">
            {options.technologies.map((technology) => (
              <FilterCheckboxRow
                key={technology.id}
                id={technology.id}
                label={technology.name}
                checked={selection.technologyIds.includes(technology.id)}
                onChange={() => {
                  onChange({
                    ...selection,
                    technologyIds: toggleId(selection.technologyIds, technology.id),
                  })
                }}
                leading={<TechnologyAvatar technology={technology} size={22} hidden />}
              />
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}

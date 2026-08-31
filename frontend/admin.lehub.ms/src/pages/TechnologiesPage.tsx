import { useCallback, type ReactNode } from 'react'
import { Layers } from 'lucide-react'
import { TechnologyAvatar } from '@lehub/shared/components/entities/TechnologyAvatar'
import { ReferenceScreen } from '@/components/reference/ReferenceScreen'
import { StatusTag } from '@/components/reference/StatusTag'
import type { Column } from '@/components/data/DataTable'
import { useReferenceList } from '@/hooks/useReferenceList'
import { listAdminTechnologies, type AdminTechnology } from '@/lib/api'
import type { Comparable } from '@/lib/referenceFilters'

type ColumnKey = 'name' | 'status'

const COLUMNS: readonly Column<AdminTechnology, ColumnKey>[] = [
  {
    key: 'name',
    header: 'Technologie',
    sortable: true,
    render: (technology) => (
      <div className="flex min-w-0 items-center gap-3">
        <TechnologyAvatar technology={technology} size={36} hidden />
        <p className="truncate font-semibold text-ink">{technology.name}</p>
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Statut',
    sortable: true,
    width: '8rem',
    render: (technology) => <StatusTag status={technology.status} />,
  },
]

/** Le nom seul : une technologie ne porte pas de description, elle étiquette un évènement. */
function searchableOf(technology: AdminTechnology): readonly (string | null)[] {
  return [technology.name]
}

function valueOf(technology: AdminTechnology, key: ColumnKey): Comparable {
  return technology[key]
}

export function TechnologiesPage(): ReactNode {
  const load = useCallback(() => listAdminTechnologies(), [])
  const state = useReferenceList(load)

  return (
    <ReferenceScreen
      title="Technologies"
      intro="Le référentiel des technologies auxquelles un évènement se rattache."
      icon={Layers}
      state={state}
      columns={COLUMNS}
      getRowId={(technology) => technology.id}
      defaultSortKey="name"
      valueOf={valueOf}
      searchableOf={searchableOf}
      searchPlaceholder="Rechercher une technologie…"
      singular="technologie"
      plural="technologies"
      emptyTitle="Aucune technologie référencée"
      emptyDescription="Les technologies apparaîtront ici une fois ajoutées au référentiel."
      errorTitle="Impossible de charger les technologies"
    />
  )
}

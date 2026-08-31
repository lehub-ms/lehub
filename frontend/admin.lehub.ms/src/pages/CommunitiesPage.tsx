import { useCallback, type ReactNode } from 'react'
import { Building2 } from 'lucide-react'
import { CommunityAvatar } from '@lehub/shared/components/entities/CommunityAvatar'
import { ReferenceScreen } from '@/components/reference/ReferenceScreen'
import { StatusTag } from '@/components/reference/StatusTag'
import type { Column } from '@/components/data/DataTable'
import { useReferenceList } from '@/hooks/useReferenceList'
import { listAdminCommunities, type AdminCommunity } from '@/lib/api'
import type { Comparable } from '@/lib/referenceFilters'

type ColumnKey = 'name' | 'organizerCount' | 'status'

const COLUMNS: readonly Column<AdminCommunity, ColumnKey>[] = [
  {
    key: 'name',
    header: 'Communauté',
    sortable: true,
    render: (community) => (
      <div className="flex min-w-0 items-center gap-3">
        <CommunityAvatar community={community} size={36} hidden />
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{community.name}</p>
          {/* Tronquée plutôt que repliée : une description longue ne doit pas faire grandir la
              ligne au point de désaligner la table. */}
          <p className="truncate text-[0.8125rem] text-ink-muted">{community.description ?? '—'}</p>
        </div>
      </div>
    ),
  },
  {
    key: 'organizerCount',
    header: 'Organisateurs',
    sortable: true,
    align: 'right',
    width: '10rem',
    // Zéro n'est pas une anomalie : une communauté peut n'avoir encore aucun organisateur
    // désigné, et Story #151 le dit en toutes lettres.
    render: (community) => <span className="text-ink-muted">{community.organizerCount}</span>,
  },
  {
    key: 'status',
    header: 'Statut',
    sortable: true,
    width: '8rem',
    render: (community) => <StatusTag status={community.status} />,
  },
]

/** La recherche porte sur le nom **et** la description, ce que Story #151 distingue explicitement
    du référentiel des technologies. */
function searchableOf(community: AdminCommunity): readonly (string | null)[] {
  return [community.name, community.description]
}

function valueOf(community: AdminCommunity, key: ColumnKey): Comparable {
  return community[key]
}

export function CommunitiesPage(): ReactNode {
  // Stable : passée telle quelle à `useReferenceList`, une lambda définie ici relancerait la
  // lecture à chaque rendu.
  const load = useCallback(() => listAdminCommunities(), [])
  const state = useReferenceList(load)

  return (
    <ReferenceScreen
      title="Communautés"
      intro="Le référentiel des communautés référencées sur LeHub."
      icon={Building2}
      state={state}
      columns={COLUMNS}
      getRowId={(community) => community.id}
      defaultSortKey="name"
      valueOf={valueOf}
      searchableOf={searchableOf}
      searchPlaceholder="Rechercher une communauté…"
      singular="communauté"
      plural="communautés"
      emptyTitle="Aucune communauté référencée"
      emptyDescription="Les communautés partenaires apparaîtront ici une fois ajoutées au référentiel."
      errorTitle="Impossible de charger les communautés"
    />
  )
}

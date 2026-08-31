import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Building2 } from 'lucide-react'
import { CommunityAvatar } from '@lehub/shared/components/entities/CommunityAvatar'
import { ReferenceScreen } from '@/components/reference/ReferenceScreen'
import {
  ReferencePanel,
  type PanelState,
  type ReferenceDraft,
} from '@/components/reference/ReferencePanel'
import { StatusTag } from '@/components/reference/StatusTag'
import type { Column } from '@/components/data/DataTable'
import { useReferenceList } from '@/hooks/useReferenceList'
import { DeleteAction } from '@/components/reference/DeleteAction'
import {
  createCommunity,
  deleteCommunity,
  listAdminCommunities,
  updateCommunity,
  type AdminCommunity,
} from '@/lib/api'
import type { Comparable } from '@/lib/referenceFilters'

type ColumnKey = 'name' | 'organizerCount' | 'status'

const COLUMNS: readonly Column<AdminCommunity, ColumnKey>[] = [
  {
    key: 'name',
    header: 'Communauté',
    sortable: true,
    render: (community) => (
      <div className="flex min-w-0 items-center gap-3">
        <CommunityAvatar community={community} size={36} hidden className="rounded-[10px]" />
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
  const [panel, setPanel] = useState<PanelState<AdminCommunity>>({ mode: 'closed' })
  // Incrémenté à chaque ouverture : c'est ce qui remonte le formulaire sans démonter le
  // `Dialog`, dont le démontage est ce qui rend le focus au bouton d'origine.
  const [session, setSession] = useState(0)
  // Le bouton qui a ouvert le panneau : c'est à lui que le focus revient à la fermeture, sans
  // quoi une personne au clavier repart du haut du document. Voir `SidePanel`.
  const trigger = useRef<HTMLElement | null>(null)

  async function save(draft: ReferenceDraft): Promise<void> {
    if (panel.mode === 'edit') {
      await updateCommunity(panel.entry.id, {
        name: draft.name,
        description: draft.description,
        logoPath: draft.logoPath,
        status: draft.status,
      })
    } else {
      await createCommunity({
        name: draft.name,
        description: draft.description,
        logoPath: draft.logoPath,
        status: draft.status,
      })
    }
    // Relire plutôt que rapiécer la liste en mémoire : les compteurs viennent du serveur, et une
    // ligne recomposée à la main finirait par diverger de ce que la table affiche.
    state.refetch()
  }

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
      labelOf={(community) => community.name}
      createLabel="Nouvelle communauté"
      onCreate={(from) => {
        trigger.current = from
        setSession((count) => count + 1)
        setPanel({ mode: 'create' })
      }}
      onEdit={(community, from) => {
        trigger.current = from
        setSession((count) => count + 1)
        setPanel({ mode: 'edit', entry: community })
      }}
      panel={
        <ReferencePanel
          kind="community"
          entry={panel.mode === 'edit' ? panel.entry : null}
          open={panel.mode !== 'closed'}
          session={session}
          onClose={() => {
            setPanel({ mode: 'closed' })
          }}
          onSubmit={save}
          restoreFocusTo={trigger}
          destructiveAction={
            panel.mode === 'edit' ? (
              <DeleteAction
                name={panel.entry.name}
                determiner="cette communauté"
                eventCount={panel.entry.eventCount}
                organizerCount={panel.entry.organizerCount}
                onDelete={async () => {
                  await deleteCommunity(panel.entry.id)
                  setPanel({ mode: 'closed' })
                  state.refetch()
                }}
                onArchive={async () => {
                  await updateCommunity(panel.entry.id, { status: 'archived' })
                  setPanel({ mode: 'closed' })
                  state.refetch()
                }}
              />
            ) : undefined
          }
        />
      }
    />
  )
}

import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Layers } from 'lucide-react'
import { TechnologyAvatar } from '@lehub/shared/components/entities/TechnologyAvatar'
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
  createTechnology,
  deleteTechnology,
  listAdminTechnologies,
  updateTechnology,
  type AdminTechnology,
} from '@/lib/api'
import type { Comparable } from '@/lib/referenceFilters'

type ColumnKey = 'name' | 'status'

const COLUMNS: readonly Column<AdminTechnology, ColumnKey>[] = [
  {
    key: 'name',
    header: 'Technologie',
    sortable: true,
    render: (technology) => (
      <div className="flex min-w-0 items-center gap-3">
        <TechnologyAvatar technology={technology} size={36} hidden className="rounded-[10px]" />
        <p className="truncate font-semibold text-ink">{technology.name}</p>
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Statut',
    // Plus triable depuis #173 : la partition range déjà les actives avant les archivées, donc
    // croissant est l'ordre rendu, décroissant ne peut pas franchir la frontière du groupe, et
    // à l'intérieur d'une moitié toutes les valeurs sont égales. Le bouton ne déplacerait rien
    // et ne changerait que `aria-sort` — un contrôle mort.
    width: '8rem',
    render: (technology) => <StatusTag status={technology.status} />,
  },
]

/** Le nom seul : une technologie ne porte pas de description, elle étiquette un évènement. */
function searchableOf(technology: AdminTechnology): readonly (string | null)[] {
  return [technology.name]
}

/** Ce qui range une entrée derrière le repli (#173). Au niveau du module : elle entre dans les
    dépendances d'un `useMemo`, et une lambda définie au rendu le relancerait à chaque passe. */
function isArchived(technology: AdminTechnology): boolean {
  return technology.status === 'archived'
}

function valueOf(technology: AdminTechnology, key: ColumnKey): Comparable {
  return technology[key]
}

export function TechnologiesPage(): ReactNode {
  const load = useCallback(() => listAdminTechnologies(), [])
  const state = useReferenceList(load)
  const [panel, setPanel] = useState<PanelState<AdminTechnology>>({ mode: 'closed' })
  // Incrémenté à chaque ouverture : c'est ce qui remonte le formulaire sans démonter le
  // `Dialog`, dont le démontage est ce qui rend le focus au bouton d'origine.
  const [session, setSession] = useState(0)
  // Le bouton qui a ouvert le panneau : c'est à lui que le focus revient à la fermeture, sans
  // quoi une personne au clavier repart du haut du document. Voir `SidePanel`.
  const trigger = useRef<HTMLElement | null>(null)

  // Pas de description : une technologie étiquette, elle ne se raconte pas, et le panneau ne lui
  // en propose pas de champ.
  async function save(draft: ReferenceDraft): Promise<void> {
    const input = { name: draft.name, logoPath: draft.logoPath, status: draft.status }
    if (panel.mode === 'edit') {
      await updateTechnology(panel.entry.id, input)
    } else {
      await createTechnology(input)
    }
    state.refetch()
  }

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
      noun={{ one: 'technologie', many: 'technologies' }}
      activeWord={{ one: 'active', many: 'actives' }}
      archivedWord={{ one: 'archivée', many: 'archivées' }}
      isArchived={isArchived}
      preferenceScope="technologies"
      emptyTitle="Aucune technologie référencée"
      emptyDescription="Les technologies apparaîtront ici une fois ajoutées au référentiel."
      errorTitle="Impossible de charger les technologies"
      labelOf={(technology) => technology.name}
      createLabel="Nouvelle technologie"
      onCreate={(from) => {
        trigger.current = from
        setSession((count) => count + 1)
        setPanel({ mode: 'create' })
      }}
      onEdit={(technology, from) => {
        trigger.current = from
        setSession((count) => count + 1)
        setPanel({ mode: 'edit', entry: technology })
      }}
      panel={
        <ReferencePanel
          kind="technology"
          entry={panel.mode === 'edit' ? { ...panel.entry, description: null } : null}
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
                determiner="cette technologie"
                eventCount={panel.entry.eventCount}
                onDelete={async () => {
                  await deleteTechnology(panel.entry.id)
                  setPanel({ mode: 'closed' })
                  state.refetch()
                }}
                onArchive={async () => {
                  await updateTechnology(panel.entry.id, { status: 'archived' })
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

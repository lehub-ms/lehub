import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react'
import { cn } from '@lehub/shared/lib/cn'
import type { SortState } from '@/lib/referenceFilters'

export interface Column<T, K extends string> {
  key: K
  header: string
  /** Une colonne sans ordre évident — les actions — n'est pas triable et ne porte pas d'en-tête bouton. */
  sortable?: boolean
  align?: 'left' | 'right'
  /** Largeur fixe pour les colonnes étroites, afin que la colonne libellé prenne le reste. */
  width?: string
  render: (entry: T) => ReactNode
}

export interface TableGroup<T> {
  /** Le libellé du contrôle, déjà accordé par l'appelant : « 3 communautés archivées ». */
  label: string
  entries: readonly T[]
  expanded: boolean
  onToggle: () => void
}

interface DataTableProps<T, K extends string> {
  caption: string
  columns: readonly Column<T, K>[]
  entries: readonly T[]
  getRowId: (entry: T) => string
  sort: SortState<K>
  onSortChange: (key: K) => void
  /** Rendu dans une dernière colonne alignée à droite, sans en-tête visible. */
  rowActions?: (entry: T) => ReactNode
  /** Des lignes repliées derrière une ligne de groupe, rendues après les autres. */
  group?: TableGroup<T>
  /**
   * Ce qui occupe la place des lignes quand `entries` est vide — la table n'est alors rendue que
   * parce qu'un groupe l'accompagne.
   */
  emptyRow?: ReactNode
}

/**
 * La table triable du backoffice.
 *
 * Elle vit ici et non dans `@lehub/shared` : le site public est fait de cartes, pas de tableaux.
 * Elle est en revanche écrite sans rien savoir des référentiels, parce que #143 et #156 ont la
 * même à rendre — c'est le même applicatif, donc le même endroit.
 *
 * Ce qu'elle possède et qu'aucun écran ne doit refaire : le contrat `aria-sort`. Un en-tête
 * triable est un vrai `<button>`, donc atteignable au clavier et activable à Entrée comme à
 * Espace, et l'attribut suit le tri courant — c'est ce que « l'annonce aux technologies
 * d'assistance » veut dire concrètement.
 *
 * `<caption>` plutôt qu'un `aria-label` : c'est le mécanisme natif pour nommer un tableau, et il
 * reste lisible quand les styles ne chargent pas.
 */
export function DataTable<T, K extends string>({
  caption,
  columns,
  entries,
  getRowId,
  sort,
  onSortChange,
  rowActions,
  group,
  emptyRow,
}: DataTableProps<T, K>): ReactNode {
  const span = columns.length + (rowActions ? 1 : 0)

  /**
   * Une ligne de données, atténuée quand elle appartient au groupe replié.
   *
   * L'atténuation ne touche pas le texte : `text-ink` à 75 % passe sous 4.5:1, et une entrée
   * archivée a droit au même contraste qu'une autre. C'est la surface qui bouge, et le retrait
   * de la première cellule qui dit l'imbrication — deux indices qui survivent au niveau de gris
   * et au mode contraste forcé, là où la couleur seule ne survit pas.
   */
  const bodyRow = (entry: T, grouped: boolean): ReactNode => (
    <tr
      key={getRowId(entry)}
      className={cn(
        'border-b border-primary/8 transition-colors last:border-0 hover:bg-surface-hover',
        grouped && 'bg-surface-group/50',
      )}
    >
      {columns.map((column, index) => (
        <td
          key={column.key}
          className={cn(
            'px-[18px] py-3',
            grouped && index === 0 && 'pl-9',
            column.align === 'right' && 'text-right',
          )}
        >
          {column.render(entry)}
        </td>
      ))}
      {rowActions ? (
        <td className="px-[18px] py-3 text-right">
          <div className="inline-flex items-center justify-end gap-1">{rowActions(entry)}</div>
        </td>
      ) : null}
    </tr>
  )
  return (
    // Le tableau défile dans son propre conteneur : sous le point de rupture c'est lui qui
    // déborde, jamais la page — un défilement horizontal du document entier rendrait la barre
    // latérale et l'en-tête inatteignables.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-[0.9375rem]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const sorted = sort.key === column.key
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  aria-sort={column.sortable ? (sorted ? sort.direction : 'none') : undefined}
                  className={cn(
                    // Les en-têtes des maquettes : petites capitales espacées sur un fond très
                    // légèrement teinté, qui pose la table sans la cerner.
                    'group h-11 border-b border-primary/12 bg-surface-subtle text-[0.75rem] font-bold tracking-[0.06em] uppercase text-ink-muted',
                    column.sortable ? 'p-0' : 'px-[18px]',
                    column.align === 'right' && 'text-right',
                  )}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSortChange(column.key)
                      }}
                      className={cn(
                        'flex h-11 w-full items-center gap-1.5 px-[18px] font-[inherit] tracking-[inherit] uppercase transition-colors hover:text-primary',
                        column.align === 'right' && 'justify-end',
                        sorted && 'text-primary',
                      )}
                    >
                      {column.header}
                      {/* Le chevron ne s'affiche qu'au survol ou sur la colonne triée : affiché
                          partout, il donne à chaque en-tête l'air d'être trié. Il reste dans le
                          flux — masqué par l'opacité et non retiré — pour que la largeur de
                          l'en-tête ne saute pas au survol. */}
                      {sorted && sort.direction === 'descending' ? (
                        <ChevronUp aria-hidden="true" className="size-3.5" />
                      ) : (
                        <ChevronDown
                          aria-hidden="true"
                          className={cn(
                            'size-3.5 transition-opacity',
                            sorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-50',
                          )}
                        />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
            {rowActions ? (
              <th
                scope="col"
                className="h-11 w-24 border-b border-primary/12 bg-surface-subtle px-[18px] text-right"
              >
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        {/* Un seul `tbody`, et ses enfants en **un seul tableau** plutôt qu'en trois expressions
            juxtaposées. React réconcilie les enfants d'un parent par position au premier niveau :
            en trois blocs, une entrée qui passe du groupe archivé au groupe actif — ce que fait
            une réactivation — change de bloc, se démonte et se remonte. Le nœud DOM que
            `SidePanel` a retenu pour rendre le focus pointerait alors dans le vide, et le focus
            retomberait sur `<body>`. En un tableau, les clés se retrouvent d'un bout à l'autre et
            la ligne survit à son déplacement. */}
        <tbody>
          {[
            ...(entries.length === 0 && emptyRow
              ? [
                  <tr key="__empty">
                    <td colSpan={span} className="px-[18px] py-8 text-center text-ink-muted">
                      {emptyRow}
                    </td>
                  </tr>,
                ]
              : entries.map((entry) => bodyRow(entry, false))),

            ...(group
              ? [
                  <tr key="__group">
                    <td colSpan={span} className="border-b border-primary/8 p-0">
                      <button
                        type="button"
                        aria-expanded={group.expanded}
                        onClick={group.onToggle}
                        // 44 px sans exception ici : contrairement aux actions de ligne, la
                        // maquette donne déjà à cette ligne une hauteur pleine, il n'y a rien à
                        // réconcilier.
                        className="flex min-h-11 w-full items-center gap-2.5 bg-surface-group px-[18px] text-left text-[0.75rem] font-bold tracking-[0.06em] text-ink-muted uppercase transition-colors hover:text-primary"
                      >
                        <ChevronRight
                          aria-hidden="true"
                          className={cn(
                            'size-4 shrink-0 transition-transform',
                            group.expanded && 'rotate-90',
                          )}
                        />
                        {group.label}
                      </button>
                    </td>
                  </tr>,
                ]
              : []),

            ...(group?.expanded ? group.entries.map((entry) => bodyRow(entry, true)) : []),
          ]}
        </tbody>
      </table>
    </div>
  )
}

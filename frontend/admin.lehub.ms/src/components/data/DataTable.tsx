import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
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

interface DataTableProps<T, K extends string> {
  caption: string
  columns: readonly Column<T, K>[]
  entries: readonly T[]
  getRowId: (entry: T) => string
  sort: SortState<K>
  onSortChange: (key: K) => void
  /** Rendu dans une dernière colonne alignée à droite, sans en-tête visible. */
  rowActions?: (entry: T) => ReactNode
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
}: DataTableProps<T, K>): ReactNode {
  return (
    // Le tableau défile dans son propre conteneur : sous le point de rupture c'est lui qui
    // déborde, jamais la page — un défilement horizontal du document entier rendrait la barre
    // latérale et l'en-tête inatteignables.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-[0.9375rem]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((column) => {
              const sorted = sort.key === column.key
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  aria-sort={column.sortable ? (sorted ? sort.direction : 'none') : undefined}
                  className={cn(
                    'py-3 font-heading text-[0.8125rem] font-semibold text-ink-muted',
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
                        'inline-flex min-h-11 items-center gap-1 rounded-lg px-1 transition-colors hover:text-primary',
                        sorted && 'text-primary',
                      )}
                    >
                      {column.header}
                      {sorted && sort.direction === 'descending' ? (
                        <ChevronUp aria-hidden="true" className="size-3.5" />
                      ) : (
                        <ChevronDown
                          aria-hidden="true"
                          className={cn('size-3.5', !sorted && 'opacity-40')}
                        />
                      )}
                    </button>
                  ) : (
                    <span className="px-1">{column.header}</span>
                  )}
                </th>
              )
            })}
            {rowActions ? (
              <th scope="col" className="w-24 py-3 text-right">
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={getRowId(entry)} className="border-b border-slate-100 last:border-0">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn('py-2.5 pr-3', column.align === 'right' && 'text-right')}
                >
                  {column.render(entry)}
                </td>
              ))}
              {rowActions ? (
                <td className="py-2.5 text-right">
                  <div className="inline-flex items-center justify-end gap-1">
                    {rowActions(entry)}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

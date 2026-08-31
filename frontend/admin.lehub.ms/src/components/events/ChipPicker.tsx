import type { ReactNode } from 'react'
import { cn } from '@lehub/shared/lib/cn'
import type { NamedRef } from '@/lib/api'

/** Une entrée proposée au rattachement, avec ce que l'écran a besoin d'en dire. */
export interface ChipEntry extends NamedRef {
  /**
   * Pourquoi cette entrée ne peut pas être décochée, ou `null` si elle le peut.
   *
   * Une **raison** et non un booléen : une pastille qu'on ne peut pas retirer doit dire
   * pourquoi, sans quoi elle passe pour cassée. #147 le demande nommément — « le retrait d'une
   * communauté co-organisatrice tierce est refusé avec un message qui en donne la raison ».
   */
  lockedReason?: string | null
  /** Ce qu'il faut faire confirmer avant de décocher, quand décocher a une conséquence. */
  confirmRemoval?: string | null
}

interface ChipPickerProps {
  legend: string
  /** L'avertissement sous le groupe — « rattacher partage la gestion ». */
  note?: string
  entries: readonly ChipEntry[]
  selected: readonly string[]
  onChange: (ids: string[]) => void
  renderAvatar: (entry: ChipEntry) => ReactNode
  /** Ce qui s'affiche quand le référentiel est vide (#147). */
  emptyLabel: string
  /** Demande confirmation. Injectée pour que les tests n'aient pas à parler au navigateur. */
  confirm?: (message: string) => boolean
}

/**
 * Une sélection multiple en pastilles.
 *
 * De vrais `<button aria-pressed>` et non des cases masquées sous un style : la maquette dessine
 * des pastilles à bascule, et `aria-pressed` est ce qui les annonce comme telles. Elles sont donc
 * atteignables au clavier et activables à Entrée comme à Espace sans une ligne de code de plus,
 * ce que #147 exige.
 *
 * **Rien ici n'est une décision de confiance.** Une pastille verrouillée est un confort : l'API
 * refuse la même écriture qu'une pastille ait été cliquable ou non (#109), et
 * `api/src/functions/adminEvent.ts` porte les règles pour de bon. Ce composant se contente de ne
 * pas laisser quelqu'un découvrir un refus après avoir tout ressaisi.
 */
export function ChipPicker({
  legend,
  note,
  entries,
  selected,
  onChange,
  renderAvatar,
  emptyLabel,
  confirm = window.confirm.bind(window),
}: ChipPickerProps): ReactNode {
  const isSelected = (id: string): boolean => selected.some((current) => current === id)

  function toggle(entry: ChipEntry): void {
    if (isSelected(entry.id)) {
      if (entry.lockedReason) return
      if (entry.confirmRemoval && !confirm(entry.confirmRemoval)) return
      onChange(selected.filter((id) => id !== entry.id))
      return
    }
    onChange([...selected, entry.id])
  }

  return (
    <fieldset className="mb-4">
      <legend className="mb-1.5 block text-[0.8125rem] font-semibold text-ink">{legend}</legend>

      {entries.length === 0 ? (
        <p className="text-[0.8125rem] text-ink-muted">{emptyLabel}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {entries.map((entry) => {
            const on = isSelected(entry.id)
            const locked = on && Boolean(entry.lockedReason)
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={on}
                // Le titre porte la raison du verrouillage : elle est ainsi lisible au survol
                // comme au clavier, sans occuper une ligne sous chaque pastille.
                {...(locked && entry.lockedReason ? { title: entry.lockedReason } : {})}
                onClick={() => {
                  toggle(entry)
                }}
                className={cn(
                  // 36 px comme la maquette sur écran pointé, 44 px sur mobile : le plancher
                  // tactile des non-négociables l'emporte là où la maquette passe dessous.
                  'inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-[0.8125rem] font-semibold transition-colors sm:min-h-9',
                  on
                    ? 'border-primary bg-primary-xs text-primary'
                    : 'border-primary/12 bg-white text-ink-muted hover:border-primary hover:text-primary',
                  locked && 'cursor-not-allowed opacity-70',
                )}
              >
                {renderAvatar(entry)}
                {entry.name}
                {entry.archived ? (
                  <span className="rounded-full bg-surface-subtle px-1.5 text-[0.6875rem] font-bold text-ink-muted uppercase">
                    Archivée
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      )}

      {note ? <p className="mt-2 text-xs leading-relaxed text-ink-muted">{note}</p> : null}
    </fieldset>
  )
}

import { useEffect, useRef, useState } from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import { Drawer } from 'vaul'
import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@lehub/shared/components/Button'
import { activeFilterCount, type EventFilterSelection, type FilterOptionsData } from '@/lib/eventFilters'
import { CommunityAvatar } from '@lehub/shared/components/entities/CommunityAvatar'
import { FilterSection } from './FilterSection'
import { TechnologyAvatar } from '@lehub/shared/components/entities/TechnologyAvatar'

interface EventFilterDrawerProps {
  options: FilterOptionsData
  selection: EventFilterSelection
  onChange: (next: EventFilterSelection) => void
  onReset: () => void
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]
}

/**
 * Mobile bottom-sheet filter drawer. Owns its own open/accordion state — `EventsPage`
 * only shares the filter `selection` it has in common with `EventFilterPanel`.
 *
 * The sheet itself is `vaul`, not a bare `@radix-ui/react-dialog`: it *is* a Radix
 * dialog underneath (same portal, focus trap, Escape and outside-click dismissal), with
 * the touch gesture layered on top. A hand-rolled `pointerdown/move/up` drag bound to
 * the grab handle could only ever move the sheet from that one 4px strip, snapped back
 * on a fast short flick because it compared distance alone, and left the scrollable body
 * unable to hand the gesture over once it was already scrolled to the top (#114). All of
 * that — follow-the-finger with rubber-banding, a velocity-aware release, the overlay
 * fading as the sheet descends, and the scroll/drag handover — is what vaul brings.
 *
 * Motion preferences need no branch here: `index.css`'s `prefers-reduced-motion` block
 * zeroes `animation-duration`/`transition-duration` with `!important`, which outranks the
 * inline transitions vaul writes while dragging.
 */
export function EventFilterDrawer({ options, selection, onChange, onReset }: EventFilterDrawerProps) {
  const [open, setOpen] = useState(false)
  // Defaults to whichever dimension actually has options — `options.communities` could
  // be empty (e.g. upcoming events all lack a community link) while `technologies`
  // isn't, in which case defaulting to the always-absent 'communities' item would open
  // the drawer with nothing expanded at all.
  const [openSection, setOpenSection] = useState(() =>
    options.communities.length > 0 ? 'communities' : 'technologies',
  )
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (options.communities.length === 0 && options.technologies.length === 0) return null

  const count = activeFilterCount(selection)

  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      <Drawer.Trigger className="relative inline-flex min-h-11 items-center gap-1.5 rounded-xl border-[1.5px] border-primary/35 px-4 text-sm font-semibold text-primary lg:hidden">
        <SlidersHorizontal aria-hidden="true" className="size-4" />
        Filtrer
        {count > 0 && (
          <span className="sr-only">
            , {count} filtre{count > 1 ? 's' : ''} actif{count > 1 ? 's' : ''}
          </span>
        )}
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[0.6875rem] font-bold text-white"
          >
            {count}
          </span>
        )}
      </Drawer.Trigger>

      <Drawer.Portal>
        <Drawer.Overlay data-testid="filter-backdrop" className="fixed inset-0 z-[290] bg-slate-900/40" />
        <Drawer.Content
          aria-modal="true"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            closeButtonRef.current?.focus()
          }}
          className="glass-strong fixed inset-x-0 bottom-0 z-[300] flex h-[85dvh] flex-col rounded-t-[20px]"
        >
          {/* Purely an affordance now: vaul drags the sheet from anywhere on it, so this
              strip carries no handler of its own — only the cursor hint desktop pointers
              expect on a draggable surface. */}
          <div className="flex shrink-0 cursor-grab justify-center pt-2.5 pb-1 active:cursor-grabbing">
            <span aria-hidden="true" className="h-1 w-9 rounded-full bg-slate-300" />
          </div>

          <div className="flex shrink-0 items-center justify-between px-8 pt-1.5 pb-3">
            <Drawer.Title className="font-heading text-lg font-bold text-ink">Filtres</Drawer.Title>
            <Drawer.Close asChild>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Fermer les filtres"
                className="flex size-11 items-center justify-center rounded-lg text-ink-body hover:bg-slate-100"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </Drawer.Close>
          </div>

          {/* Its own scrollport, which is what lets vaul hand the gesture back and forth:
              a downward drag starting here scrolls the list, and only drags the sheet
              once the list is already at the top. */}
          <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-8">
            <Accordion.Root type="single" collapsible value={openSection} onValueChange={setOpenSection}>
              {options.communities.length > 0 && (
                <FilterSection
                  value="communities"
                  label="Communauté"
                  options={options.communities}
                  selectedIds={selection.communityIds}
                  onToggle={(id) => {
                    onChange({ ...selection, communityIds: toggleId(selection.communityIds, id) })
                  }}
                  onClear={() => {
                    onChange({ ...selection, communityIds: [] })
                  }}
                  renderSummaryChip={(option) => <CommunityAvatar community={option} size={22} hidden />}
                  renderLeading={(option) => <CommunityAvatar community={option} size={22} hidden />}
                />
              )}
              {options.technologies.length > 0 && (
                <FilterSection
                  value="technologies"
                  label="Technologie"
                  options={options.technologies}
                  selectedIds={selection.technologyIds}
                  onToggle={(id) => {
                    onChange({ ...selection, technologyIds: toggleId(selection.technologyIds, id) })
                  }}
                  onClear={() => {
                    onChange({ ...selection, technologyIds: [] })
                  }}
                  renderSummaryChip={(option) => <TechnologyAvatar technology={option} size={22} hidden />}
                  renderLeading={(option) => <TechnologyAvatar technology={option} size={22} hidden />}
                />
              )}
            </Accordion.Root>
          </div>

          {/* No footer at all when nothing is selected — the × at the top already
              closes the drawer, and there's nothing here to apply or clear. */}
          {count > 0 && (
            <div className="shrink-0 px-10 pt-4 pb-[max(24px,calc(env(safe-area-inset-bottom)+16px))]">
              <div className="flex gap-3 border-t border-primary/10 pt-4">
                <Button
                  variant="outline"
                  className="min-w-0 flex-1 rounded-full"
                  onClick={() => {
                    onReset()
                    setOpen(false)
                  }}
                >
                  Effacer tout
                </Button>
                <Button
                  variant="primary"
                  className="min-w-0 flex-1 rounded-full bg-cta shadow-none hover:bg-cta-dark"
                  onClick={() => {
                    setOpen(false)
                  }}
                >
                  {`Appliquer (${count})`}
                </Button>
              </div>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

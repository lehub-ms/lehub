import { type PointerEvent, useEffect, useRef, useState } from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import * as Dialog from '@radix-ui/react-dialog'
import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/Button'
import { activeFilterCount, type EventFilterSelection, type FilterOptionsData } from '@/lib/eventFilters'
import { CommunityAvatar } from './CommunityAvatar'
import { FilterSection } from './FilterSection'
import { TechnologyAvatar } from './TechnologyAvatar'

interface EventFilterDrawerProps {
  options: FilterOptionsData
  selection: EventFilterSelection
  onChange: (next: EventFilterSelection) => void
  onReset: () => void
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Swipe released before this snaps back open, matching the mock. */
const DRAG_CLOSE_THRESHOLD_PX = 80

/**
 * Mobile bottom-sheet filter drawer. Owns its own open/accordion state — `EventsPage`
 * only shares the filter `selection` it has in common with `EventFilterPanel`.
 */
export function EventFilterDrawer({ options, selection, onChange, onReset }: EventFilterDrawerProps) {
  const [open, setOpen] = useState(false)
  const [openSection, setOpenSection] = useState('communities')
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)

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

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    dragStartY.current = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragStartY.current === null || !contentRef.current || prefersReducedMotion()) return
    const dy = Math.max(0, event.clientY - dragStartY.current)
    contentRef.current.style.transition = 'none'
    contentRef.current.style.transform = `translateY(${dy}px)`
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragStartY.current === null) return
    const dy = Math.max(0, event.clientY - dragStartY.current)
    dragStartY.current = null

    if (contentRef.current) {
      contentRef.current.style.transition = ''
      contentRef.current.style.transform = ''
    }

    if (dy > DRAG_CLOSE_THRESHOLD_PX) setOpen(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="relative inline-flex min-h-11 items-center gap-1.5 rounded-xl border-[1.5px] border-primary/35 px-4 text-sm font-semibold text-primary lg:hidden">
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
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay data-testid="filter-backdrop" className="fixed inset-0 z-[290] bg-slate-900/40" />
        <Dialog.Content
          ref={contentRef}
          aria-modal="true"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            closeButtonRef.current?.focus()
          }}
          className="animate-drawer-in glass-strong fixed inset-x-0 bottom-0 z-[300] flex h-[85dvh] flex-col rounded-t-[20px]"
        >
          <div
            className="flex shrink-0 touch-none justify-center pt-2.5 pb-1"
            style={{ cursor: 'grab' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <span aria-hidden="true" className="h-1 w-9 rounded-full bg-slate-300" />
          </div>

          <div className="flex shrink-0 items-center justify-between px-8 pt-1.5 pb-3">
            <Dialog.Title className="font-heading text-lg font-bold text-ink">Filtres</Dialog.Title>
            <Dialog.Close asChild>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Fermer les filtres"
                className="flex size-11 items-center justify-center rounded-lg text-ink-body hover:bg-slate-100"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-8">
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
                  renderLeading={(option) => <CommunityAvatar community={option} size={22} />}
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
                  renderLeading={(option) => <TechnologyAvatar technology={option} size={22} />}
                />
              )}
            </Accordion.Root>
          </div>

          <div className="shrink-0 px-10 pt-4 pb-[max(24px,calc(env(safe-area-inset-bottom)+16px))]">
            <div className={`flex gap-3 border-t border-primary/10 pt-4 ${count > 0 ? '' : 'justify-center'}`}>
              {count > 0 && (
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
              )}
              <Button
                variant="primary"
                className={
                  count > 0
                    ? 'min-w-0 flex-1 rounded-full bg-cta shadow-none hover:bg-cta-dark'
                    : 'min-w-[180px] rounded-full bg-cta shadow-none hover:bg-cta-dark'
                }
                onClick={() => {
                  setOpen(false)
                }}
              >
                {count > 0 ? `Appliquer (${count})` : 'Fermer'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

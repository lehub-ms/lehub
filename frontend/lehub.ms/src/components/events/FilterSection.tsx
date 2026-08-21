import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'
import type { FilterOption } from '@/lib/eventFilters'
import { FilterCheckboxRow } from './FilterCheckboxRow'

interface SummaryItem {
  id: string
  name: string
  chip: ReactNode
}

/**
 * The trigger row's selection summary: one small chip per selected option, shrinking to
 * a "+N" overflow chip as soon as the row can't fit them all. Re-measures with the real
 * DOM box (`scrollWidth` vs `clientWidth`) rather than guessing a fixed chip count,
 * since chip width varies with content (an avatar's initial vs. a technology name).
 */
function FilterSummaryChips({ items }: { items: SummaryItem[] }) {
  // Keyed on the selection's identity so a swap (different ids, same or different
  // count — the chip widths can differ either way) remounts `Measured` with a fresh
  // `visibleCount` state, instead of resetting it from an effect.
  const key = items.map((item) => item.id).join(',')
  return <MeasuredFilterSummaryChips key={key} items={items} />
}

function MeasuredFilterSummaryChips({ items }: { items: SummaryItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(items.length)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || visibleCount === 0) return
    if (container.scrollWidth <= container.clientWidth) return
    setVisibleCount((count) => Math.max(0, count - 1))
  }, [visibleCount])

  if (items.length === 0) {
    return <span className="text-sm text-[#71717A]">Tout</span>
  }

  const hiddenCount = items.length - visibleCount

  return (
    <div
      ref={containerRef}
      aria-label={items.map((item) => item.name).join(', ')}
      className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
    >
      {items.slice(0, visibleCount).map((item) => (
        <span key={item.id} aria-hidden="true" className="shrink-0">
          {item.chip}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span
          aria-hidden="true"
          className="flex h-[22px] shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 px-1.5 text-[0.6875rem] font-semibold text-slate-600"
        >
          +{hiddenCount}
        </span>
      )}
    </div>
  )
}

interface FilterSectionProps {
  value: string
  label: string
  options: FilterOption[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onClear: () => void
  renderSummaryChip: (option: FilterOption) => ReactNode
  renderLeading: (option: FilterOption) => ReactNode
}

/** Drawer-only accordion section: label, chip summary, per-section "Effacer", options. */
export function FilterSection({
  value,
  label,
  options,
  selectedIds,
  onToggle,
  onClear,
  renderSummaryChip,
  renderLeading,
}: FilterSectionProps) {
  const summaryItems: SummaryItem[] = options
    .filter((option) => selectedIds.includes(option.id))
    .map((option) => ({ id: option.id, name: option.name, chip: renderSummaryChip(option) }))

  return (
    <Accordion.Item value={value} className="border-b border-slate-100 last:border-b-0">
      <Accordion.Header className="flex items-center gap-2">
        <Accordion.Trigger className="group flex min-h-14 flex-1 items-center gap-3 text-left">
          <span className="shrink-0 text-[0.6875rem] font-bold tracking-[0.08em] text-ink-muted uppercase">
            {label}
          </span>
          <FilterSummaryChips items={summaryItems} />
          <ChevronDown
            aria-hidden="true"
            className="size-[18px] shrink-0 text-ink-muted transition-transform duration-200 group-data-[state=open]:rotate-180"
          />
        </Accordion.Trigger>
        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="min-h-11 shrink-0 rounded-md px-3 text-sm text-primary hover:bg-primary/5"
          >
            Effacer
          </button>
        )}
      </Accordion.Header>
      <Accordion.Content className="overflow-hidden pb-3 data-[state=closed]:animate-none">
        <div className="flex flex-col gap-0.5">
          {options.map((option) => (
            <FilterCheckboxRow
              key={option.id}
              id={option.id}
              label={option.name}
              checked={selectedIds.includes(option.id)}
              onChange={() => {
                onToggle(option.id)
              }}
              leading={renderLeading(option)}
            />
          ))}
        </div>
      </Accordion.Content>
    </Accordion.Item>
  )
}

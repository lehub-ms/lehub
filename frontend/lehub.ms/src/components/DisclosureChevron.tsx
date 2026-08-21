import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Rotates and recolors on its ancestor Radix Accordion/Collapsible trigger's
 * `data-state="open"` — the trigger must carry the `group` class for `group-data-*` to reach
 * it.
 */
export function DisclosureChevron({ className }: { className?: string }) {
  return (
    <ChevronDown
      aria-hidden="true"
      focusable="false"
      className={cn(
        'shrink-0 text-ink-muted transition-transform duration-200 group-data-[state=open]:rotate-180 group-data-[state=open]:text-primary',
        className,
      )}
    />
  )
}

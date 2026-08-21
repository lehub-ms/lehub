import type { NamedRef } from '@/lib/api'
import { technologyPillColors } from '@/lib/technologyPalette'

interface TechnologySwatchProps {
  technologyId: string
  size?: number
  className?: string
}

/** The color-swatch dot alone, reused as the `leading` element in filter checkbox rows. */
export function TechnologySwatch({ technologyId, size = 18, className }: TechnologySwatchProps) {
  return (
    <span
      aria-hidden="true"
      className={className ?? 'shrink-0 rounded-[5px]'}
      style={{ width: size, height: size, backgroundColor: technologyPillColors(technologyId).text }}
    />
  )
}

interface TechnologyPillProps {
  technology: NamedRef
}

/**
 * Color swatch + name. No per-technology icon: the design mock's icon set is a
 * hardcoded 6-entry map that can't generalize to arbitrary DB rows an admin may add
 * later, so a deterministic color swatch (matching the acceptance criterion's own
 * wording, "pastille de couleur + nom") replaces it.
 */
export function TechnologyPill({ technology }: TechnologyPillProps) {
  const { bg, text } = technologyPillColors(technology.id)

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: bg, color: text }}
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: text }} />
      {technology.name}
    </span>
  )
}

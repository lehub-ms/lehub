import { cn } from '@/lib/cn'

interface MediaPlaceholderProps {
  caption: string
  className?: string
}

/**
 * Stand-in for a screenshot that doesn't exist yet. `role="img"` with the caption as its
 * accessible name — unlike `Placeholder`, this isn't "the feature isn't built", it's "the
 * feature is built, its illustration is pending" — so it renders inline within finished UI
 * rather than replacing a whole section.
 */
export function MediaPlaceholder({ caption, className }: MediaPlaceholderProps) {
  return (
    <div
      role="img"
      aria-label={caption}
      className={cn(
        'flex aspect-video items-center justify-center rounded-2xl border border-primary/15 bg-[repeating-linear-gradient(135deg,var(--color-primary-xs)_0px,var(--color-primary-xs)_14px,rgb(77_159_222/0.16)_14px,rgb(77_159_222/0.16)_28px)] p-6 text-center',
        className,
      )}
    >
      <span aria-hidden="true" className="font-mono text-xs text-primary-dark/75">
        {caption}
      </span>
    </div>
  )
}

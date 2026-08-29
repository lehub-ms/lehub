import { cn } from '@lehub/shared/lib/cn'

/**
 * The LeHub wordmark.
 *
 * Its second half sits at 4.25:1 against the canvas, below the AA floor — WCAG 1.4.3
 * exempts logotypes from the contrast requirement, which is why it stays as designed.
 * Space Grotesk tops out at weight 700, so `font-bold` is the real maximum here; the
 * mock-up's 800 already renders as 700 in a browser.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-heading font-bold tracking-tight text-primary', className)}>
      Le<span className="text-cta">Hub</span>
    </span>
  )
}

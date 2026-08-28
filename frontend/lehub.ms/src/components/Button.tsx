import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@shared/lib/cn'
import { BUTTON_BASE, BUTTON_VARIANTS } from '@/lib/button-styles'

type Variant = 'primary' | 'outline' | 'ghost'

/** Not shared with `button-styles.ts` — `ghost` has no navigating (`LinkButton`) use yet. */
const GHOST_VARIANT = 'text-ink-muted hover:bg-primary/5 hover:text-primary'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

/**
 * `LinkButton`'s non-navigating sibling: actions like "Filtrer", "Appliquer", "Effacer
 * tout" or "Réinitialiser" don't have an `href`, so they can't be a `Link`.
 */
export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(BUTTON_BASE, variant === 'ghost' ? GHOST_VARIANT : BUTTON_VARIANTS[variant], className)}
      {...props}
    />
  )
}

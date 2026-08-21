import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'outline' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white shadow-[0_4px_14px_rgb(0_95_184/0.35)] hover:bg-primary-dark',
  outline: 'border-[1.5px] border-primary/35 text-primary hover:border-primary hover:bg-primary-xs',
  ghost: 'text-ink-muted hover:bg-primary/5 hover:text-primary',
}

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
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-6 text-[0.9375rem] font-semibold transition-colors',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}

import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'outline'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white shadow-[0_4px_14px_rgb(0_95_184/0.35)] hover:bg-primary-dark',
  outline: 'border-[1.5px] border-primary/35 text-primary hover:border-primary hover:bg-primary-xs',
}

interface LinkButtonProps {
  to: string
  variant?: Variant
  className?: string
  children: ReactNode
}

/** `min-h-11` is 44px: the touch-target floor stories #10 and #8 both require. */
export function LinkButton({ to, variant = 'primary', className, children }: LinkButtonProps) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-6 text-[0.9375rem] font-semibold transition-colors',
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </Link>
  )
}

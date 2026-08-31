import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '../lib/cn'
import { BUTTON_BASE, BUTTON_VARIANTS } from '../lib/button-styles'

type Variant = 'primary' | 'outline'

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
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], className)}
    >
      {children}
    </Link>
  )
}

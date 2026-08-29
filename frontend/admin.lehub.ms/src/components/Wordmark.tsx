import { cn } from '@shared/lib/cn'

/**
 * Le logotype du backoffice : la marque LeHub, suivie de l'étiquette qui dit où l'on est.
 *
 * La seconde moitié de la marque est à 4,25:1 sur le fond, sous le plancher AA — WCAG 1.4.3
 * exempte les logotypes, comme sur le site public.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      <span className="font-heading font-bold tracking-tight text-primary">
        Le<span className="text-cta">Hub</span>
      </span>
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-primary uppercase">
        Admin
      </span>
    </span>
  )
}

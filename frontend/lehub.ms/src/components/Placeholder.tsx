import type { ReactNode } from 'react'

/**
 * Marks where a feature will land. Deliberately looks provisional: a fake count or a
 * dead filter button would be a lie the rest of the shell does not tell.
 */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[20px] border border-dashed border-primary/25 bg-white/60 p-8 text-center text-sm text-ink-muted backdrop-blur-md">
      {children}
    </p>
  )
}

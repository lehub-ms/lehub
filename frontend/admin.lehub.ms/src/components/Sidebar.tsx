import type { ReactNode } from 'react'
import { cn } from '@lehub/shared/lib/cn'
import { SidebarBody } from './SidebarBody'

/**
 * La barre latérale persistante du bureau.
 *
 * Largeurs et point de rupture repris de la maquette : 260px, 72px réduite, et le passage en
 * tiroir sous 900px. Ce n'est pas un palier Tailwind standard, d'où la variante littérale —
 * une barre de 260px plus du contenu tabulaire ne tient pas en dessous.
 */
export function Sidebar({
  communityId,
  collapsed,
  onToggleCollapse,
}: {
  communityId: string | null
  collapsed: boolean
  onToggleCollapse: () => void
}): ReactNode {
  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col overflow-x-hidden border-r border-primary/12 bg-white transition-[width] duration-200 max-[900px]:hidden',
        collapsed ? 'w-[72px]' : 'w-[260px]',
      )}
    >
      <SidebarBody
        communityId={communityId}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
    </aside>
  )
}

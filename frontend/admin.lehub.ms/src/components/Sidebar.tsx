import type { ReactNode } from 'react'
import { cn } from '@lehub/shared/lib/cn'
import { SidebarBody } from './SidebarBody'

/**
 * La barre latérale persistante du bureau.
 *
 * Largeurs et point de rupture repris de la maquette : 260px, 72px réduite, et le passage en
 * tiroir au palier `md`, celui-là même que le site public utilise pour replier sa navigation.
 * Un seul seuil dans le projet ; entre 768px et 900px la barre mange beaucoup de largeur, et
 * c'est la réduction à 72px qui sert de porte de sortie.
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
        'flex shrink-0 flex-col overflow-x-hidden border-r border-primary/12 bg-white transition-[width] duration-200 max-md:hidden',
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

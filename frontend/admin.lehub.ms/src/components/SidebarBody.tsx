import { PanelLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@lehub/shared/lib/cn'
import { AccountBlock } from './AccountBlock'
import { SidebarNav } from './SidebarNav'
import { Wordmark } from './Wordmark'

/**
 * Le contenu de la barre latérale, rendu à deux endroits : la barre fixe du bureau et le
 * tiroir mobile.
 *
 * Un seul composant pour les deux, et `collapsed` en paramètre plutôt qu'en état interne.
 * C'est ce qui fait tenir l'edge case de la story sans effort : le tiroir monte toujours son
 * instance avec `collapsed={false}`, donc l'état réduit du bureau ne peut pas y fuir, ni
 * l'inverse.
 */
export function SidebarBody({
  communityId,
  collapsed,
  onToggleCollapse,
}: {
  communityId: string | null
  collapsed: boolean
  /** Absent dans le tiroir : on n'y réduit rien, la barre y occupe déjà toute sa largeur. */
  onToggleCollapse?: () => void
}): ReactNode {
  return (
    <>
      <div
        className={cn(
          'flex min-h-[72px] items-center gap-2.5 border-b border-primary/12 px-4',
          collapsed && 'justify-center px-0',
        )}
      >
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Déployer le menu' : 'Réduire le menu'}
            className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-ink-muted transition-colors hover:bg-primary-xs hover:text-primary"
          >
            <PanelLeft aria-hidden="true" className="size-5" />
          </button>
        ) : null}
        {collapsed ? null : <Wordmark className="text-[1.0625rem]" />}
      </div>

      <SidebarNav communityId={communityId} collapsed={collapsed} />
      <AccountBlock collapsed={collapsed} />
    </>
  )
}

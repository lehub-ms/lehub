import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { CommunityAvatar } from '@lehub/shared/components/entities/CommunityAvatar'
import { cn } from '@lehub/shared/lib/cn'
import { useAllowedCommunities } from '@/community/useAllowedCommunities'
import { useSelectedCommunity } from '@/community/useSelectedCommunity'
import { communityPath, type CommunitySection } from '@/lib/navigation'
import { writeLastCommunityId } from '@/lib/preferences'

/**
 * Le sélecteur de communauté, en tête de la barre latérale.
 *
 * Il ne propose que ce que la session autorise — le filtrage est fait par le fournisseur, pas
 * ici. `RadioGroup` plutôt qu'une liste de boutons : la story demande que le sélecteur annonce
 * l'élément sélectionné, ce que `aria-checked` fait nativement là où une classe `active` ne
 * dit rien à un lecteur d'écran.
 */
export function CommunityPicker({ collapsed }: { collapsed: boolean }): ReactNode {
  const communities = useAllowedCommunities()
  const selected = useSelectedCommunity()
  const { communityId } = useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  if (communities.status !== 'success' || communities.communities.length === 0) return null

  // Hors de la section communauté, le sélecteur reste visible mais ne pilote rien : il n'y a
  // pas de communauté dans l'URL, et les référentiels n'appartiennent à aucune. Il affiche
  // alors la dernière retenue, pour ne pas se vider en passant sur ces écrans.
  const shown = selected ?? communities.communities[0]
  if (!shown) return null

  const choose = (id: string): void => {
    const next = communities.communities.find((community) => community.id === id)
    if (!next) return
    writeLastCommunityId(next.id)

    if (!communityId) return

    // La section, jamais le reste du chemin : basculer de communauté en gardant
    // « /evenements/<id> » emmènerait sur l'évènement d'une autre communauté.
    const section = pathname.split('/')[3] as CommunitySection | undefined
    void navigate(communityPath(next.id, section ?? 'evenements'), { replace: true })
  }

  const face = (
    <>
      <CommunityAvatar community={shown} size={32} hidden className="rounded-[9px]" />
      {collapsed ? null : (
        <span className="flex min-w-0 flex-1 flex-col overflow-hidden text-left">
          <span className="text-[0.6875rem] font-semibold tracking-[0.04em] text-ink-muted uppercase">
            Communauté
          </span>
          <span className="truncate text-sm font-semibold text-ink">{shown.name}</span>
        </span>
      )}
    </>
  )

  const shell = cn(
    'flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-primary/12 bg-primary-xs p-2',
    collapsed && 'justify-center',
  )

  // Une seule communauté : rien à choisir. Un menu déroulant à un élément est une promesse
  // vide, et l'edge case de la story demande explicitement de s'en passer.
  if (communities.communities.length === 1) {
    return (
      <div className={shell} title={collapsed ? shown.name : undefined}>
        {face}
        <span className="sr-only">Communauté : {shown.name}</span>
      </div>
    )
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(shell, 'cursor-pointer text-left hover:border-primary')}
        aria-label={`Communauté : ${shown.name}. Changer de communauté`}
        title={collapsed ? shown.name : undefined}
      >
        {face}
        {collapsed ? null : (
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
        )}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-[320] max-h-[280px] min-w-[13rem] overflow-y-auto rounded-xl border border-primary/12 bg-white p-1.5 shadow-[0_10px_30px_rgb(0_0_0/0.12)]"
        >
          <DropdownMenu.RadioGroup value={shown.id} onValueChange={choose}>
            {communities.communities.map((community) => (
              <DropdownMenu.RadioItem
                key={community.id}
                value={community.id}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm outline-none select-none data-highlighted:bg-primary-xs data-highlighted:text-primary"
              >
                <CommunityAvatar community={community} size={26} hidden className="rounded-lg" />
                <span className="flex-1 truncate">{community.name}</span>
                <DropdownMenu.ItemIndicator>
                  <Check aria-hidden="true" className="size-4 text-primary" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

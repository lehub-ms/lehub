import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { CommunityAvatar } from '@lehub/shared/components/entities/CommunityAvatar'
import { cn } from '@lehub/shared/lib/cn'
import { useActiveCommunity } from '@/community/useActiveCommunity'
import { useCommunitiesValue } from '@/community/useAllowedCommunities'
import { communityPath, type CommunitySection } from '@/lib/navigation'

/**
 * Le sélecteur de communauté, en tête de la barre latérale.
 *
 * Il ne propose que ce que la session autorise — le filtrage est fait par le fournisseur, pas
 * ici. `RadioGroup` plutôt qu'une liste de boutons : la story demande que le sélecteur annonce
 * l'élément sélectionné, ce que `aria-checked` fait nativement là où une classe `active` ne
 * dit rien à un lecteur d'écran.
 */
export function CommunityPicker({ collapsed }: { collapsed: boolean }): ReactNode {
  const { state: communities, selectCommunity } = useCommunitiesValue()
  const shown = useActiveCommunity()
  const { communityId } = useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  if (communities.status !== 'success' || communities.communities.length === 0) return null
  if (!shown) return null

  const choose = (id: string): void => {
    const next = communities.communities.find((community) => community.id === id)
    if (!next) return

    // Retenir d'abord, toujours : c'est ce qui fait que la barre latérale repointe aussitôt
    // sur la nouvelle communauté, y compris sur un écran d'administration générale où l'URL
    // n'en porte aucune. Sans cela le clic n'avait aucun effet visible — le défaut constaté.
    selectCommunity(next.id)

    // Sur un écran d'administration générale, on ne navigue pas : ces référentiels
    // n'appartiennent à aucune communauté, et la story demande que le sélecteur n'y pilote
    // pas le contenu. Il pilote la barre, ce qui n'est pas la même chose.
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

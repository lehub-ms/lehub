import { useCallback, type ReactNode } from 'react'
import { CommunityAvatar } from '@lehub/shared/components/entities/CommunityAvatar'
import { PeopleScreen } from '@/components/people/PeopleScreen'
import { useSelectedCommunity } from '@/community/useSelectedCommunity'
import { useReferenceList } from '@/hooks/useReferenceList'
import { designateOrganizer, listCommunityOrganizers, removeOrganizer } from '@/lib/api'
import type { Word } from '@/lib/words'

const ORGANIZER: Word = { one: 'organisateur', many: 'organisateurs' }

/**
 * Les organisateurs de la communauté sélectionnée.
 *
 * L'écran appartient à la section de la communauté, donc son identifiant vient de l'URL — ce
 * qui est aussi ce qui le fait se recharger au changement de communauté : le slug est un
 * segment de route, en changer navigue, et `load` change avec l'identifiant.
 *
 * Un organisateur peut désigner sur les communautés qu'il organise, et sur aucune autre ; un
 * administrateur global le peut partout. Rien ne le vérifie ici : `CommunityScope` ne monte cet
 * écran que sur une communauté que la session peut piloter, et `canDesignateOrganizer` tranche
 * côté serveur. Une URL forgée sur une autre communauté reçoit le même 403, qu'elle soit passée
 * par cet écran ou non.
 */
export function OrganizersPage(): ReactNode {
  const community = useSelectedCommunity()
  const communityId = community?.id ?? ''

  const load = useCallback(() => listCommunityOrganizers(communityId), [communityId])
  const state = useReferenceList(load)

  const designate = useCallback(
    async (email: string) => {
      await designateOrganizer(communityId, email)
    },
    [communityId],
  )

  const remove = useCallback(
    async (email: string) => {
      await removeOrganizer(communityId, email)
    },
    [communityId],
  )

  // `CommunityScope` ne monte cet écran que sur une communauté résolue et autorisée ; ce garde
  // n'existe que pour le type.
  if (!community) return null

  return (
    <PeopleScreen
      title="Organisateurs de"
      titleSuffix={
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/12 bg-white py-[3px] pr-3 pl-1.5 font-heading text-lg font-semibold text-primary">
          <CommunityAvatar community={community} size={24} hidden className="rounded-full" />
          {community.name}
        </span>
      }
      intro="Membres autorisés à créer et gérer les évènements de cette communauté."
      state={state}
      noun={ORGANIZER}
      addLabel="Ajouter un organisateur"
      pickerSubtitle="Sélectionnez un compte LeHub existant"
      emptyDescription="Cette communauté reste gérable par les administrateurs globaux tant que personne n’y est désigné."
      errorTitle="Impossible de charger les organisateurs"
      removalCopy={{
        title: 'Retirer cet organisateur ?',
        consequence: (name) => (
          <>
            {name} ne pourra plus gérer les évènements de cette communauté. Son compte LeHub n’est
            pas supprimé, et les évènements qu’elle a créés ne le sont pas non plus.
          </>
        ),
        selfConsequence: (
          <>
            Vous perdrez l’accès à cette communauté dès votre prochaine action, sans avoir à vous
            reconnecter. Votre compte LeHub n’est pas supprimé.
          </>
        ),
      }}
      onDesignate={designate}
      onRemove={remove}
    />
  )
}

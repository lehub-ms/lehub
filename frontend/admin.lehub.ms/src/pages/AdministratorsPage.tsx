import { useCallback, type ReactNode } from 'react'
import { PeopleScreen } from '@/components/people/PeopleScreen'
import { useReferenceList } from '@/hooks/useReferenceList'
import { designateAdministrator, listAdministrators, removeAdministrator } from '@/lib/api'
import type { Word } from '@/lib/words'

const ADMINISTRATOR: Word = { one: 'administrateur', many: 'administrateurs' }

/** Stable, donc défini hors du composant : `useReferenceList` relirait à chaque passe sinon. */
const load = () => listAdministrators()

/**
 * Les administrateurs globaux, dans la section « Administration générale ».
 *
 * L'écran n'est atteignable que par un administrateur, et la garde est la route parente
 * `RequireGlobalAdmin` plutôt qu'une vérification ici : c'est ce qui fait qu'un
 * non-administrateur n'en monte rien, et n'en apprend donc rien. L'API refuse de son côté.
 *
 * Le garde-fou du dernier administrateur ne vit pas ici non plus : il dépend d'un compte, pas
 * d'une session, et c'est le serveur qui le tient. L'écran restitue son refus dans la modale,
 * qui reste ouverte — voir `RemoveAction`.
 */
export function AdministratorsPage(): ReactNode {
  const state = useReferenceList(load)

  const designate = useCallback(async (email: string) => {
    await designateAdministrator(email)
  }, [])

  const remove = useCallback(async (email: string) => {
    await removeAdministrator(email)
  }, [])

  return (
    <PeopleScreen
      title="Administrateurs"
      intro="Comptes autorisés à gérer les référentiels partagés et l’ensemble des communautés."
      state={state}
      noun={ADMINISTRATOR}
      addLabel="Ajouter un administrateur"
      pickerSubtitle="Sélectionnez un compte LeHub existant"
      emptyDescription="Un administrateur au moins existe toujours : si cette liste est vide, c’est que le chargement a échoué."
      errorTitle="Impossible de charger les administrateurs"
      removalCopy={{
        title: 'Retirer cet administrateur ?',
        consequence: (name) => (
          <>
            {name} perdra les droits globaux sur LeHub. Son compte LeHub n’est pas supprimé, et
            ses désignations d’organisateur ne sont pas touchées.
          </>
        ),
        selfConsequence: (
          <>
            Vous perdrez les droits globaux sur LeHub dès votre prochaine action, sans avoir à
            vous reconnecter, et cette section disparaîtra. Votre compte LeHub n’est pas supprimé.
          </>
        ),
      }}
      onDesignate={designate}
      onRemove={remove}
    />
  )
}

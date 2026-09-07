import { PreferencesCard } from '@/components/profile/PreferencesCard'

/**
 * Le profil, délibérément mince.
 *
 * #103 le remplira — l'identité, les méthodes de connexion, ce qui relève de la Feature #102. Ce
 * qui existe ici est ce que #195 exige et rien de plus : la page qui porte le récapitulatif des
 * préférences, pour que la Story ne reste pas suspendue à une Feature qui n'est pas commencée.
 *
 * La garde de session est posée sur la route (`routes.ts`), pas ici : une page qui se protège
 * elle-même est une page qu'on peut oublier de protéger.
 */
export function ProfilePage() {
  return (
    <div className="pb-8">
      <h1 className="text-4xl font-bold tracking-tight md:text-[2.5rem]">Mon profil</h1>

      <div className="mt-10">
        <PreferencesCard />
      </div>
    </div>
  )
}

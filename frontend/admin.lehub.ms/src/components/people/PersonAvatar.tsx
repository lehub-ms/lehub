import type { ReactNode } from 'react'
import { UserRound } from 'lucide-react'
import { cn } from '@lehub/shared/lib/cn'
import { accountInitials } from '@/lib/accountInitials'

interface PersonAvatarProps {
  person: { givenName?: string; surname?: string } | null
  /** Le côté du disque, en pixels. 36 dans une ligne de table, 34 dans le tiroir, 36 dans la barre. */
  size: number
  className?: string
}

/**
 * La marque d'une personne : ses initiales sur le dégradé de la marque, ou une icône.
 *
 * Extrait d'`AccountBlock`, qui le rendait en dur, parce que #156 en ajoute trois usages — les
 * lignes des deux tables et les résultats du tiroir de recherche. Une personne se reconnaît de
 * la même façon partout dans le backoffice, ou bien elle ne se reconnaît pas.
 *
 * Il ne reçoit **qu'un prénom et un nom**, comme `accountInitials` et `accountLabel` : aucun
 * chemin ne mène d'une adresse email à ce qui s'affiche. Le legacy avait fait fuiter des
 * adresses dans la navigation en dérivant un prénom de la partie locale d'une adresse ; fermer
 * la porte au niveau de la signature ferme la classe entière de ces défauts.
 *
 * `aria-hidden` : le nom de la personne est toujours écrit à côté du disque. Annoncer « AR »
 * juste avant « Amélie Rousseau » ne dirait rien de plus, et dirait mal.
 */
export function PersonAvatar({ person, size, className }: PersonAvatarProps): ReactNode {
  const initials = accountInitials(person)

  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-primary to-primary-light font-heading font-bold text-white',
        className,
      )}
    >
      {initials ?? <UserRound aria-hidden="true" style={{ width: size * 0.45 }} />}
    </span>
  )
}

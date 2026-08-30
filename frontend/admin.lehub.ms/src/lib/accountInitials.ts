/**
 * Les initiales affichées dans la barre latérale.
 *
 * Comme `accountLabel` du socle, la fonction ne reçoit **qu'un prénom et un nom** : aucun
 * chemin ne mène d'une adresse email à ce qui s'affiche. Le legacy avait fait fuiter des
 * adresses dans la navigation en dérivant un prénom de la partie locale de l'adresse, et
 * fermer la porte au niveau de la signature ferme la classe entière de ces défauts.
 *
 * `null` quand il n'y a rien à en tirer : l'appelant rend alors une icône, jamais une lettre
 * inventée.
 */
export function accountInitials(user: { givenName?: string; surname?: string } | null): string | null {
  if (!user) return null
  const letters = [user.givenName, user.surname]
    .map((part) => part?.trim().charAt(0).toUpperCase() ?? '')
    .filter((letter) => letter !== '')
    .join('')
  return letters === '' ? null : letters
}

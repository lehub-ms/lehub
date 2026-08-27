/**
 * Ce que la navigation affiche pour un compte connecté — et rien d'autre.
 *
 * La règle tient dans le type d'entrée : cette fonction ne reçoit qu'un prénom et un nom.
 * L'adresse email n'y entre pas, donc aucun chemin ne mène d'une adresse à ce libellé. Le
 * legacy avait fait fuiter des adresses dans la navigation en dérivant un prénom de la
 * partie locale de l'adresse ; fermer la porte au niveau de la signature ferme la classe
 * entière de ces bugs plutôt qu'un de ses cas.
 */
export const NEUTRAL_ACCOUNT_LABEL = 'Mon compte'

export function accountLabel(user: { givenName?: string; surname?: string } | null): string {
  if (!user) return NEUTRAL_ACCOUNT_LABEL
  // `trim` puis `filter` : un nom vide ne doit pas laisser un espace isolé derrière le prénom.
  const label = [user.givenName, user.surname]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' ')
  return label === '' ? NEUTRAL_ACCOUNT_LABEL : label
}

/**
 * Les règles de mot de passe affichées pendant la saisie.
 *
 * Elles reflètent la politique par défaut d'Entra External ID : huit caractères au minimum,
 * et trois classes de caractères sur quatre. La maquette annonçait dix caractères ; le
 * sous-code `password_too_short` du tenant en documente huit, et c'est le tenant qui arbitre.
 * La correction est due en retour au projet Claude Design.
 *
 * Ce sont un guide, jamais une barrière : elles ne bloquent aucune soumission. Le refus vient
 * d'External ID et passe par la table de messages — un mot de passe conforme en longueur et
 * en classes peut parfaitement être rejeté parce qu'il figure dans la liste des mots de passe
 * interdits, et aucune règle affichable ne saurait le prédire.
 */
export const PASSWORD_MIN_LENGTH = 8

/** Au-delà, on considère la longueur confortable et la jauge gagne sa quatrième barre. */
const COMFORTABLE_LENGTH = 14

export interface PasswordRule {
  readonly id: string
  readonly label: string
  readonly test: (value: string) => boolean
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    label: `Au moins ${String(PASSWORD_MIN_LENGTH)} caractères`,
    test: (value) => value.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: 'case',
    label: 'Une majuscule et une minuscule',
    test: (value) => /[a-z]/.test(value) && /[A-Z]/.test(value),
  },
  {
    id: 'symbol',
    label: 'Un chiffre ou un caractère spécial',
    test: (value) => /\d/.test(value) || /[^A-Za-z0-9]/.test(value),
  },
]

/** Zéro à quatre barres : les trois règles, plus une pour la longueur confortable. */
export function passwordScore(value: string): number {
  if (value === '') return 0
  const met = PASSWORD_RULES.filter((rule) => rule.test(value)).length
  return met + (value.length >= COMFORTABLE_LENGTH ? 1 : 0)
}

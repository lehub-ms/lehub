/**
 * Ce qu'External ID refuse, dit en français et dans le vocabulaire du parcours en cours.
 *
 * Le tenant répond par des codes techniques anglais, parfois assortis d'un sous-code qui
 * porte la vraie cause. La table ci-dessous est une donnée, pas une suite de conditions
 * dispersées dans les écrans : elle se lit d'un seul tenant et s'étend sans toucher à un
 * composant.
 *
 * Deux règles la gouvernent.
 *
 * **Le sous-code prime sur le code.** Un `invalid_grant` accompagné d'un sous-code
 * `password_banned` est un mot de passe interdit, pas un identifiant incorrect. C'est
 * exactement le bug que le legacy a livré puis corrigé, et l'ordre de résolution est ce qui
 * l'empêche de revenir.
 *
 * **Le message dépend du parcours.** Un même code ne dit pas la même chose à l'inscription
 * et à la connexion, et un message qui n'a aucun sens dans le parcours courant ne s'affiche
 * jamais — « Email ou mot de passe incorrect » n'a rien à faire dans une inscription.
 *
 * Le libellé brut d'External ID, lui, n'atteint jamais l'utilisateur : le relais le retient
 * déjà côté API, où il part dans les journaux.
 */
export type AuthFlow = 'signup' | 'signin' | 'reset'

export interface AuthErrorResponse {
  error?: string | null
  suberror?: string | null
}

/**
 * Ces codes ne sont pas des échecs : ils disent à l'application ce qu'il lui reste à fournir.
 * Les écrans branchent dessus avant de parler d'erreur. S'ils arrivaient jusqu'ici, c'est le
 * message de repli du parcours qui s'afficherait — visible, mais faux, donc à traiter en amont.
 */
export const FLOW_CONTROL_ERRORS: ReadonlySet<string> = new Set([
  'attributes_required',
  'verification_required',
  'credential_required',
])

/**
 * La réponse à la première étape d'une réinitialisation ne révèle jamais si l'adresse
 * correspond à un compte. Cette constante est le message du succès **et** celui que reçoit
 * `user_not_found` : c'est la même chaîne, et un test l'asserte, parce que deux libellés
 * écrits séparément finissent toujours par diverger.
 */
export const RESET_SENT_MESSAGE =
  'Si un compte existe avec cette adresse, un code vient de lui être envoyé.'

/** Ce qu'on dit quand la cause est chez nous et non chez l'utilisateur. */
const UNAVAILABLE = {
  signup: "L'inscription est momentanément indisponible. Réessayez dans quelques instants.",
  signin: 'La connexion est momentanément indisponible. Réessayez dans quelques instants.',
  reset: 'La réinitialisation est momentanément indisponible. Réessayez dans quelques instants.',
} as const

/**
 * Les codes qui trahissent une configuration du tenant, pas une saisie. L'utilisateur ne peut
 * rien y faire et n'a pas à en connaître la cause : il reçoit le même message d'indisponibilité
 * dans les trois parcours, et le détail reste dans les journaux de l'API.
 */
function unavailableFor(flow: AuthFlow): Record<string, string> {
  return {
    invalid_client: UNAVAILABLE[flow],
    unauthorized_client: UNAVAILABLE[flow],
    unsupported_challenge_type: UNAVAILABLE[flow],
    unsupported_grant_type: UNAVAILABLE[flow],
    invalid_scope: UNAVAILABLE[flow],
    nativeauthapi_disabled: UNAVAILABLE[flow],
  }
}

const INVALID_CODE = 'Ce code est incorrect. Vérifiez-le et saisissez-le à nouveau.'

interface FlowMessages {
  /** Consultés en premier : le sous-code porte la cause précise quand il est là. */
  readonly subErrors: Readonly<Record<string, string>>
  /** Le repli quand le sous-code est absent ou inconnu. */
  readonly errors: Readonly<Record<string, string>>
  /** Et le repli du repli, propre au parcours. */
  readonly fallback: string
}

const MESSAGES: Readonly<Record<AuthFlow, FlowMessages>> = {
  signup: {
    subErrors: {
      ...unavailableFor('signup'),
      password_too_short: 'Ce mot de passe est trop court : il doit faire au moins 8 caractères.',
      password_too_long: 'Ce mot de passe est trop long : il ne doit pas dépasser 256 caractères.',
      password_too_weak:
        'Ce mot de passe est trop simple. Mélangez majuscules, minuscules, chiffres et caractères spéciaux.',
      password_banned:
        'Ce mot de passe est trop courant pour être accepté. Choisissez-en un moins prévisible.',
      password_is_invalid: "Ce mot de passe contient des caractères qui ne sont pas autorisés.",
      invalid_oob_value: INVALID_CODE,
      attribute_validation_failed:
        "Votre prénom ou votre nom n'a pas été accepté. Vérifiez leur saisie.",
    },
    errors: {
      ...unavailableFor('signup'),
      user_already_exists:
        "Un compte existe déjà avec cette adresse. Connectez-vous, ou utilisez « Mot de passe oublié » si vous l'avez perdu.",
      expired_token: 'Votre inscription a expiré. Reprenez-la depuis le début.',
    },
    fallback: "L'inscription n'a pas pu aboutir. Vérifiez vos informations et réessayez.",
  },

  signin: {
    subErrors: {
      ...unavailableFor('signin'),
      invalid_oob_value: INVALID_CODE,
    },
    errors: {
      ...unavailableFor('signin'),
      // Même message pour un compte inconnu que pour un mot de passe faux : dire lequel des
      // deux est en cause permet d'énumérer les comptes du tenant.
      user_not_found: 'Email ou mot de passe incorrect.',
      invalid_grant: 'Email ou mot de passe incorrect.',
      expired_token: 'Votre connexion a expiré. Recommencez.',
    },
    fallback: 'Email ou mot de passe incorrect.',
  },

  reset: {
    subErrors: {
      ...unavailableFor('reset'),
      invalid_oob_value: INVALID_CODE,
      password_too_short: 'Ce mot de passe est trop court : il doit faire au moins 8 caractères.',
      password_too_long: 'Ce mot de passe est trop long : il ne doit pas dépasser 256 caractères.',
      password_too_weak:
        'Ce mot de passe est trop simple. Mélangez majuscules, minuscules, chiffres et caractères spéciaux.',
      password_banned:
        'Ce mot de passe est trop courant pour être accepté. Choisissez-en un moins prévisible.',
      password_is_invalid: "Ce mot de passe contient des caractères qui ne sont pas autorisés.",
      password_recently_used:
        'Ce mot de passe a déjà été utilisé récemment. Choisissez-en un autre.',
    },
    errors: {
      ...unavailableFor('reset'),
      // Neutralité de la première étape : la même phrase que le succès, littéralement.
      user_not_found: RESET_SENT_MESSAGE,
      expired_token: 'Votre demande a expiré. Recommencez la réinitialisation.',
    },
    fallback: "La réinitialisation n'a pas pu aboutir. Réessayez.",
  },
}

/**
 * Le sous-code d'abord, le code ensuite, le repli du parcours en dernier.
 *
 * Un sous-code inconnu ne fait pas perdre le code connu qui l'accompagne : il est simplement
 * ignoré, et la résolution continue.
 */
export function authMessage(flow: AuthFlow, response: AuthErrorResponse): string {
  const { subErrors, errors, fallback } = MESSAGES[flow]

  const suberror = response.suberror
  if (suberror) {
    const message = subErrors[suberror]
    if (message) return message
  }

  const error = response.error
  if (error) {
    const message = errors[error]
    if (message) return message
  }

  return fallback
}

/** Exposée pour que les tests parcourent la table plutôt que quelques cas choisis. */
export const MESSAGE_TABLE = MESSAGES

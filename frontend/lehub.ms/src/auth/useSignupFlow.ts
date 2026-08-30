import { useCallback, useState } from 'react'
import { authMessage, FLOW_CONTROL_ERRORS } from '@lehub/shared/lib/authErrors'
import {
  postAuthStep,
  SERVICE_UNAVAILABLE,
  tokensFrom,
  type AuthStepData,
  type AuthStepResult,
} from '@lehub/shared/auth/authClient'
import { storeTokens } from '@lehub/shared/auth/tokenStore'
import { useAuth } from '@lehub/shared/auth/useAuth'

/**
 * L'inscription, de bout en bout, telle qu'Entra la déroule.
 *
 *   start → challenge → continue(oob) → continue(password) → token
 *
 * L'ordre surprend et il est celui du protocole : le mot de passe n'est soumis qu'**après**
 * la vérification de l'adresse. La maquette le collecte pourtant sur le premier écran, ce qui
 * est le bon choix d'interface — on le garde en mémoire le temps du code plutôt que de faire
 * revenir l'utilisateur sur un troisième écran.
 *
 * `credential_required` arrive en 400 et n'est pas un échec : c'est le tenant qui réclame le
 * mot de passe, jeton de continuation à l'appui. D'où `FLOW_CONTROL_ERRORS`.
 *
 * `stage` dit quel écran, `busy` dit si un appel est en vol. Les mêler ferait qu'une
 * soumission depuis le formulaire afficherait aussitôt l'écran du code, avant même de savoir
 * si le tenant a accepté l'adresse.
 */
export type SignupStage = 'form' | 'code'

export interface SignupCredentials {
  givenName: string
  surname: string
  email: string
  password: string
}

interface Pending extends SignupCredentials {
  continuationToken: string
}

export interface SignupFlow {
  stage: SignupStage
  busy: boolean
  error: string | null
  /**
   * Incrémenté à chaque code refusé. L'écran s'en sert comme `key` sur le champ de saisie,
   * qui repart donc vide : sans cela les cases restent pleines, et corriger un seul caractère
   * suffit à re-soumettre le code entier — celui d'avant, encore faux.
   */
  attempt: number
  /** Longueur du code annoncée par le tenant. 8 sur ce tenant, jamais codé en dur ici. */
  codeLength: number
  /** L'adresse masquée telle que le tenant l'affiche, pour la reprendre à l'écran. */
  targetLabel: string | null
  email: string | null
  start: (credentials: SignupCredentials) => Promise<void>
  submitCode: (code: string) => Promise<void>
  resendCode: () => Promise<void>
  clearError: () => void
  backToForm: () => void
}

const DEFAULT_CODE_LENGTH = 8

/** Le jeton de continuation d'une réponse, succès ou refus de contrôle de flux. */
function continuationOf(data: AuthStepData): string | null {
  return data.continuation_token ?? null
}

export function useSignupFlow(): SignupFlow {
  const { completeSignIn } = useAuth()
  const [stage, setStage] = useState<SignupStage>('form')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [codeLength, setCodeLength] = useState(DEFAULT_CODE_LENGTH)
  const [targetLabel, setTargetLabel] = useState<string | null>(null)

  const fail = useCallback((result: Extract<AuthStepResult, { ok: false }>): void => {
    setError(authMessage('signup', result.error))
    setBusy(false)
    setAttempt((count) => count + 1)
  }, [])

  const start = useCallback(
    async (credentials: SignupCredentials) => {
      setError(null)
      setBusy(true)

      const started = await postAuthStep('signup', {
        step: 'start',
        username: credentials.email,
        // Les clés sont celles du parcours du tenant. Entra ignore ce qu'il ne connaît pas,
        // et c'est `entra-userflow.json` qui fait foi sur leur nom.
        attributes: { givenName: credentials.givenName, surname: credentials.surname },
      })
      if (!started.ok) return fail(started)

      const startToken = continuationOf(started.data)
      if (!startToken) return fail({ ok: false, error: {}, data: {} })

      const challenged = await postAuthStep('signup', {
        step: 'challenge',
        continuation_token: startToken,
      })
      if (!challenged.ok) return fail(challenged)

      const challengeToken = continuationOf(challenged.data)
      if (!challengeToken) return fail({ ok: false, error: {}, data: {} })

      if (typeof challenged.data.code_length === 'number') setCodeLength(challenged.data.code_length)
      setTargetLabel(challenged.data.challenge_target_label ?? credentials.email)
      setPending({ ...credentials, continuationToken: challengeToken })
      setBusy(false)
      setStage('code')
    },
    [fail],
  )

  const submitCode = useCallback(
    async (code: string) => {
      if (!pending) return
      setError(null)
      setBusy(true)

      // 1. Le code. Le tenant répond alors `credential_required` : ce n'est pas un échec,
      //    c'est la demande du mot de passe, et le jeton de continuation est dans la réponse.
      const verified = await postAuthStep('signup', {
        step: 'continue',
        continuation_token: pending.continuationToken,
        grant_type: 'oob',
        oob: code,
      })
      const afterCode = verified.ok
        ? continuationOf(verified.data)
        : verified.error.error !== undefined &&
            verified.error.error !== null &&
            FLOW_CONTROL_ERRORS.has(verified.error.error)
          ? continuationOf(verified.data)
          : null

      if (!afterCode) {
        fail(verified.ok ? { ok: false, error: {}, data: {} } : verified)
        return
      }

      // 2. Le mot de passe, gardé depuis le premier écran.
      const withPassword = await postAuthStep('signup', {
        step: 'continue',
        continuation_token: afterCode,
        grant_type: 'password',
        password: pending.password,
      })
      if (!withPassword.ok) {
        fail(withPassword)
        return
      }
      const afterPassword = continuationOf(withPassword.data)
      if (!afterPassword) {
        fail({ ok: false, error: {}, data: {} })
        return
      }

      // 3. Les jetons. Aucune session n'est ouverte avant ce point : une inscription
      //    interrompue avant la vérification n'en laisse aucune derrière elle.
      const issued = await postAuthStep('signup', {
        step: 'token',
        continuation_token: afterPassword,
      })
      if (!issued.ok) {
        fail(issued)
        return
      }
      const tokens = tokensFrom(issued.data)
      if (!tokens) {
        fail({ ok: false, error: {}, data: {} })
        return
      }

      storeTokens(tokens)
      try {
        // Le prénom et le nom saisis servent de repli si le tenant ne les a pas encore propagés
        // dans ses claims — sans écran intermédiaire, l'utilisateur ne voit rien de tout ça.
        await completeSignIn({ givenName: pending.givenName, surname: pending.surname })
      } catch {
        // Le compte existe et les jetons sont émis ; c'est l'ouverture de session côté LeHub
        // qui a échoué. Sans ce filet l'écran resterait figé sur « Vérification en cours… »,
        // tous les contrôles désactivés, avec un compte parfaitement utilisable derrière.
        fail({ ok: false, error: { error: SERVICE_UNAVAILABLE }, data: {} })
      }
    },
    [pending, fail, completeSignIn],
  )

  const resendCode = useCallback(async () => {
    if (!pending) return
    setError(null)
    setAttempt((count) => count + 1)
    const challenged = await postAuthStep('signup', {
      step: 'challenge',
      continuation_token: pending.continuationToken,
    })
    if (!challenged.ok) {
      fail(challenged)
      return
    }
    const token = continuationOf(challenged.data)
    if (token) setPending({ ...pending, continuationToken: token })
  }, [pending, fail])

  return {
    stage,
    busy,
    attempt,
    error,
    codeLength,
    targetLabel,
    email: pending?.email ?? null,
    start,
    submitCode,
    resendCode,
    clearError: useCallback(() => {
      setError(null)
    }, []),
    backToForm: useCallback(() => {
      setError(null)
      setBusy(false)
      setStage('form')
    }, []),
  }
}

import { useCallback, useRef, useState } from 'react'
import { authMessage, RESET_SENT_MESSAGE } from '../lib/authErrors'
import { postAuthStep, tokensFrom, type AuthStepResult } from './authClient'
import { storeTokens } from './tokenStore'
import { useAuth } from './useAuth'

/**
 * La réinitialisation self-service : start → challenge → continue(oob) → submit → poll → token.
 *
 * Deux particularités du protocole s'y logent.
 *
 * **La neutralité de la première étape.** Le tenant répond `user_not_found` quand l'adresse
 * n'existe pas — un oracle d'existence de compte, offert en clair. Le parcours avance donc
 * vers l'écran de code exactement comme si l'adresse existait, avec le même message, mais
 * sans jeton de continuation. Le code saisi ensuite est refusé comme un code incorrect. Les
 * deux chemins sont indiscernables de l'extérieur, ce qui est le seul critère qui compte.
 *
 * **L'attente.** Le tenant applique le nouveau mot de passe de façon asynchrone et annonce
 * lui-même l'intervalle entre deux vérifications. Sans cette boucle, un écran conclurait à
 * l'échec d'une réinitialisation qui n'avait simplement pas fini.
 */
export type ResetStage = 'email' | 'code' | 'password' | 'submitting' | 'done'

export interface ResetFlow {
  stage: ResetStage
  error: string | null
  notice: string | null
  codeLength: number
  targetLabel: string | null
  requestCode: (email: string) => Promise<void>
  submitCode: (code: string) => Promise<void>
  submitPassword: (password: string) => Promise<void>
  clearError: () => void
}

const DEFAULT_CODE_LENGTH = 8
/** Bornes sur l'attente : le tenant annonce l'intervalle, jamais la patience du client. */
const MAX_POLL_ATTEMPTS = 15
const DEFAULT_POLL_SECONDS = 2

function wait(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000))
}

export function useResetFlow(): ResetFlow {
  const { completeSignIn } = useAuth()
  const [stage, setStage] = useState<ResetStage>('email')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [codeLength, setCodeLength] = useState(DEFAULT_CODE_LENGTH)
  const [targetLabel, setTargetLabel] = useState<string | null>(null)

  // Hors état : un jeton de continuation ne se rend pas, il ne déclenche aucun rendu, et le
  // garder ici évite qu'une étape lise la valeur d'avant.
  const token = useRef<string | null>(null)

  const fail = useCallback((result: Extract<AuthStepResult, { ok: false }>, back: ResetStage) => {
    setError(authMessage('reset', result.error))
    setStage(back)
  }, [])

  const requestCode = useCallback(
    async (email: string) => {
      setError(null)
      setStage('submitting')

      const started = await postAuthStep('reset', { step: 'start', username: email })

      // Adresse inconnue : on avance quand même, sans jeton. Rien ne distingue ce chemin de
      // celui d'un compte existant, et c'est exactement l'effet recherché.
      if (!started.ok && started.error.error === 'user_not_found') {
        token.current = null
        setTargetLabel(email)
        setNotice(RESET_SENT_MESSAGE)
        setStage('code')
        return
      }
      if (!started.ok) return fail(started, 'email')

      const startToken = started.data.continuation_token
      if (!startToken) return fail({ ok: false, error: {}, data: {} }, 'email')

      const challenged = await postAuthStep('reset', {
        step: 'challenge',
        continuation_token: startToken,
      })
      if (!challenged.ok) return fail(challenged, 'email')

      token.current = challenged.data.continuation_token ?? null
      if (typeof challenged.data.code_length === 'number') setCodeLength(challenged.data.code_length)
      setTargetLabel(challenged.data.challenge_target_label ?? email)
      setNotice(RESET_SENT_MESSAGE)
      setStage('code')
    },
    [fail],
  )

  const submitCode = useCallback(
    async (code: string) => {
      setError(null)
      setNotice(null)

      // Pas de jeton : l'adresse n'existait pas. Le refus est celui d'un code invalide,
      // le même que pour un vrai compte et un mauvais code.
      if (!token.current) {
        setError(authMessage('reset', { error: 'invalid_grant', suberror: 'invalid_oob_value' }))
        return
      }

      setStage('submitting')
      const verified = await postAuthStep('reset', {
        step: 'continue',
        continuation_token: token.current,
        oob: code,
      })
      if (!verified.ok) return fail(verified, 'code')

      const next = verified.data.continuation_token
      if (!next) return fail({ ok: false, error: {}, data: {} }, 'code')

      token.current = next
      setStage('password')
    },
    [fail],
  )

  const submitPassword = useCallback(
    async (password: string) => {
      if (!token.current) return
      setError(null)
      setStage('submitting')

      const submitted = await postAuthStep('reset', {
        step: 'submit',
        continuation_token: token.current,
        new_password: password,
      })
      if (!submitted.ok) return fail(submitted, 'password')

      let polling = submitted.data.continuation_token
      if (!polling) return fail({ ok: false, error: {}, data: {} }, 'password')
      const interval = submitted.data.poll_interval ?? DEFAULT_POLL_SECONDS

      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
        await wait(interval)
        const polled = await postAuthStep('reset', {
          step: 'poll',
          continuation_token: polling,
        })
        if (!polled.ok) return fail(polled, 'password')
        polling = polled.data.continuation_token ?? polling

        if (polled.data.status === 'succeeded') {
          const issued = await postAuthStep('reset', { step: 'token', continuation_token: polling })
          if (!issued.ok) return fail(issued, 'password')
          const tokens = tokensFrom(issued.data)
          if (!tokens) return fail({ ok: false, error: {}, data: {} }, 'password')

          storeTokens(tokens)
          await completeSignIn()
          setStage('done')
          return
        }
        if (polled.data.status === 'failed') return fail({ ok: false, error: {}, data: {} }, 'password')
      }

      fail({ ok: false, error: {}, data: {} }, 'password')
    },
    [fail, completeSignIn],
  )

  return {
    stage,
    error,
    notice,
    codeLength,
    targetLabel,
    requestCode,
    submitCode,
    submitPassword,
    clearError: useCallback(() => {
      setError(null)
    }, []),
  }
}

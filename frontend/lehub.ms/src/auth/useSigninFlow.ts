import { useCallback, useState } from 'react'
import { authMessage } from '../lib/authErrors'
import { postAuthStep, tokensFrom, type AuthStepResult } from './authClient'
import { storeTokens } from './tokenStore'
import { useAuth } from './useAuth'

/**
 * La connexion : start → challenge → token.
 *
 * Trois allers-retours pour ce qui ressemble à un seul geste, parce que c'est le tenant qui
 * choisit la méthode d'authentification à l'étape du challenge plutôt que l'application.
 *
 * Rien n'est décidé ici sur la validité des identifiants : un compte dont l'adresse n'a
 * jamais été vérifiée, un compte verrouillé après trop de tentatives, un mot de passe faux —
 * les trois sont des refus d'External ID, rendus par la table de messages du parcours.
 */
export interface SigninFlow {
  submitting: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  clearError: () => void
}

export function useSigninFlow(onSuccess: () => void): SigninFlow {
  const { completeSignIn } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fail = useCallback((result: Extract<AuthStepResult, { ok: false }>) => {
    setError(authMessage('signin', result.error))
    setSubmitting(false)
  }, [])

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null)
      setSubmitting(true)

      const started = await postAuthStep('signin', { step: 'start', username: email })
      if (!started.ok) return fail(started)
      const startToken = started.data.continuation_token
      if (!startToken) return fail({ ok: false, error: {}, data: {} })

      const challenged = await postAuthStep('signin', {
        step: 'challenge',
        continuation_token: startToken,
      })
      if (!challenged.ok) return fail(challenged)
      const challengeToken = challenged.data.continuation_token
      if (!challengeToken) return fail({ ok: false, error: {}, data: {} })

      const issued = await postAuthStep('signin', {
        step: 'token',
        continuation_token: challengeToken,
        grant_type: 'password',
        password,
      })
      if (!issued.ok) return fail(issued)

      const tokens = tokensFrom(issued.data)
      if (!tokens) return fail({ ok: false, error: {}, data: {} })

      storeTokens(tokens)
      // Aucun repli de nom ici : à la connexion, le compte existe déjà et ses claims aussi.
      await completeSignIn()
      setSubmitting(false)
      onSuccess()
    },
    [fail, completeSignIn, onSuccess],
  )

  return {
    submitting,
    error,
    signIn,
    clearError: useCallback(() => {
      setError(null)
    }, []),
  }
}

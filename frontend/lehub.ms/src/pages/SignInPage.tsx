import { LogIn } from 'lucide-react'
import { useCallback, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '@shared/auth/useAuth'
import { useSigninFlow } from '@shared/auth/useSigninFlow'
import { AuthCard } from '@shared/components/AuthCard'
import { Alert } from '@shared/components/form/Alert'
import { Field } from '@shared/components/form/Field'
import { PasswordInput } from '@shared/components/form/PasswordInput'
import { cn } from '@shared/lib/cn'
import { BUTTON_BLOCK, BUTTON_BLOCK_PRIMARY, INPUT_BASE } from '@shared/lib/form-styles'
import { PATHS } from '@/lib/navigation'
import { safeRedirect } from '@shared/lib/safeRedirect'

/**
 * Se connecter depuis un formulaire LeHub, sans jamais voir une page hébergée par Microsoft.
 *
 * La destination d'origine voyage dans l'état de navigation plutôt que dans l'URL : elle n'a
 * pas à être partageable, et elle passe par `safeRedirect` avant d'être suivie.
 */
export function SignInPage(): ReactNode {
  const { state } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const destination = safeRedirect(
    (location.state as { from?: unknown } | null)?.from,
    PATHS.home,
  )

  const onSuccess = useCallback(() => {
    void navigate(destination, { replace: true })
  }, [navigate, destination])

  const flow = useSigninFlow(onSuccess)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Déjà connecté : lui montrer un formulaire de connexion n'aurait aucun sens.
  if (state.status === 'authenticated') return <Navigate to={destination} replace />

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    void flow.signIn(email, password)
  }

  return (
    <AuthCard
      titleId="signin-title"
      title="Content de vous revoir"
      subtitle="Connectez-vous pour retrouver vos évènements et communautés."
    >
      {flow.error ? <Alert tone="error">{flow.error}</Alert> : null}

      <form onSubmit={onSubmit} noValidate>
        <Field htmlFor="signin-email" label="Adresse email">
          <input
            id="signin-email"
            className={INPUT_BASE}
            type="email"
            autoComplete="email"
            placeholder="prenom.nom@exemple.fr"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              flow.clearError()
            }}
            required
          />
        </Field>

        <Field
          htmlFor="signin-password"
          label="Mot de passe"
          action={
            <Link
              to={PATHS.resetPassword}
              className="text-[0.8125rem] font-medium text-primary hover:underline"
            >
              Mot de passe oublié ?
            </Link>
          }
        >
          <PasswordInput
            id="signin-password"
            value={password}
            onChange={(value) => {
              setPassword(value)
              flow.clearError()
            }}
            autoComplete="current-password"
            placeholder="••••••••••"
            disabled={flow.submitting}
          />
        </Field>

        <button
          type="submit"
          className={cn(BUTTON_BLOCK, BUTTON_BLOCK_PRIMARY, 'mt-2')}
          disabled={flow.submitting}
        >
          <LogIn aria-hidden="true" className="size-[18px]" />
          {flow.submitting ? 'Connexion en cours…' : 'Me connecter'}
        </button>
      </form>

      <p className="mt-6 text-center text-[0.9375rem] text-ink-muted">
        Pas encore de compte ?{' '}
        <Link to={PATHS.signUp} className="font-semibold text-primary hover:underline">
          Créer un compte
        </Link>
      </p>
      <p className="mt-6 border-t border-primary/9 pt-5 text-center text-xs leading-normal text-ink-muted">
        Votre identité est gérée par Microsoft Entra External ID. LeHub ne stocke aucun mot de
        passe.
      </p>
    </AuthCard>
  )
}

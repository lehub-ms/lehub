import { LogIn } from 'lucide-react'
import { useCallback, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '@lehub/shared/auth/useAuth'
import { useSigninFlow } from '@lehub/shared/auth/useSigninFlow'
import { AuthCard } from '@lehub/shared/components/AuthCard'
import { Alert } from '@lehub/shared/components/form/Alert'
import { Field } from '@lehub/shared/components/form/Field'
import { PasswordInput } from '@lehub/shared/components/form/PasswordInput'
import { cn } from '@lehub/shared/lib/cn'
import { BUTTON_BLOCK, BUTTON_BLOCK_PRIMARY, INPUT_BASE } from '@lehub/shared/lib/form-styles'
import { safeRedirect } from '@lehub/shared/lib/safeRedirect'
import { PATHS, PUBLIC_SITE_URL } from '@/lib/navigation'

/**
 * Se connecter au backoffice, par le même parcours et le même contrat que le site public.
 *
 * Un écran de moins qu'ailleurs, et c'est la différence qui compte : **aucun lien
 * d'inscription**. Un compte se crée sur lehub.ms, et le backoffice n'est pas une surface
 * d'inscription — c'est le sens du dernier paragraphe.
 */
export function SignInPage(): ReactNode {
  const { state } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const destination = safeRedirect((location.state as { from?: unknown } | null)?.from, PATHS.home)

  const onSuccess = useCallback(() => {
    void navigate(destination, { replace: true })
  }, [navigate, destination])

  const flow = useSigninFlow(onSuccess)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Déjà connecté : la garde décidera s'il a accès, ce n'est pas le rôle de cet écran.
  if (state.status === 'authenticated') return <Navigate to={destination} replace />

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    void flow.signIn(email, password)
  }

  return (
    <AuthCard
      titleId="signin-title"
      title="Connexion à la console de gestion"
      subtitle="Accès réservé aux administrateurs et aux organisateurs des communautés."
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

      <p className="mt-6 border-t border-primary/9 pt-5 text-center text-xs leading-normal text-ink-muted">
        Pas encore de compte LeHub ? Il se crée sur{' '}
        <a href={PUBLIC_SITE_URL} className="font-semibold text-primary hover:underline">
          lehub.ms
        </a>
        . Votre identité est gérée par Microsoft Entra External ID, et LeHub ne stocke aucun mot
        de passe.
      </p>
    </AuthCard>
  )
}

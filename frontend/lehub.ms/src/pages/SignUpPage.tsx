import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router'
import { AuthCard } from '@/components/auth/AuthCard'
import { Alert } from '@/components/form/Alert'
import { Field } from '@/components/form/Field'
import { OtpInput } from '@/components/form/OtpInput'
import { PasswordInput } from '@/components/form/PasswordInput'
import { useAuth } from '@/auth/useAuth'
import { useSignupFlow } from '@/auth/useSignupFlow'
import { BUTTON_BLOCK, BUTTON_BLOCK_PRIMARY, INPUT_BASE } from '@/lib/form-styles'
import { PATHS } from '@/lib/navigation'
import { cn } from '@/lib/cn'

/**
 * Créer un compte, sans jamais quitter le domaine LeHub.
 *
 * Deux états dans la même carte : le formulaire, puis la saisie du code reçu par email. Le
 * mot de passe est collecté au premier écran bien que le protocole ne le réclame qu'après la
 * vérification — le garder en mémoire vaut mieux que faire revenir l'utilisateur.
 */
export function SignUpPage(): ReactNode {
  const { state } = useAuth()
  const flow = useSignupFlow()

  const [givenName, setGivenName] = useState('')
  const [surname, setSurname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Déjà connecté : un formulaire d'inscription n'a rien à lui proposer.
  if (state.status === 'authenticated') return <Navigate to={PATHS.home} replace />

  const busy = flow.busy

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    void flow.start({ givenName, surname, email, password })
  }

  if (flow.stage === 'form') {
    return (
      <AuthCard
        titleId="signup-title"
        title="Créer votre compte"
        subtitle="Rejoignez la communauté Microsoft francophone en moins d'une minute."
      >
        {flow.error ? <Alert tone="error">{flow.error}</Alert> : null}

        <form onSubmit={onSubmit} noValidate>
          <div className="mb-4 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <Field htmlFor="signup-given-name" label="Prénom">
              <input
                id="signup-given-name"
                className={INPUT_BASE}
                type="text"
                autoComplete="given-name"
                placeholder="Jane"
                value={givenName}
                onChange={(event) => {
                  setGivenName(event.target.value)
                  flow.clearError()
                }}
                required
              />
            </Field>
            <Field htmlFor="signup-surname" label="Nom">
              <input
                id="signup-surname"
                className={INPUT_BASE}
                type="text"
                autoComplete="family-name"
                placeholder="Dupont"
                value={surname}
                onChange={(event) => {
                  setSurname(event.target.value)
                  flow.clearError()
                }}
                required
              />
            </Field>
          </div>

          <Field htmlFor="signup-email" label="Adresse email">
            <input
              id="signup-email"
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

          <Field htmlFor="signup-password" label="Mot de passe">
            <PasswordInput
              id="signup-password"
              value={password}
              onChange={(value) => {
                setPassword(value)
                flow.clearError()
              }}
              autoComplete="new-password"
              placeholder="Choisissez un mot de passe fort"
              withGuidance
              disabled={busy}
            />
          </Field>

          <button
            type="submit"
            className={cn(BUTTON_BLOCK, BUTTON_BLOCK_PRIMARY, 'mt-2')}
            disabled={busy}
          >
            {busy ? 'Création en cours…' : 'Créer mon compte'}
            <ArrowRight aria-hidden="true" className="size-[18px]" />
          </button>
          <p className="mt-3 text-center text-xs text-ink-muted">
            Un code de vérification vous sera envoyé par email.
          </p>
        </form>

        <p className="mt-6 text-center text-[0.9375rem] text-ink-muted">
          Vous avez déjà un compte ?{' '}
          <Link to={PATHS.signIn} className="font-semibold text-primary hover:underline">
            Se connecter
          </Link>
        </p>
        <p className="mt-6 border-t border-primary/9 pt-5 text-center text-xs leading-normal text-ink-muted">
          Votre identité est gérée par Microsoft Entra External ID. LeHub ne stocke aucun mot de passe.
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      titleId="signup-otp-title"
      title="Vérifiez votre email"
      subtitle={
        <>
          Nous avons envoyé un code de vérification à{' '}
          <strong className="text-ink">{flow.targetLabel}</strong>. Saisissez-le pour finaliser la
          création de votre compte.
        </>
      }
    >
      {flow.error ? <Alert tone="error">{flow.error}</Alert> : null}

      {/* `Alert` porte déjà `role="alert"` et s'annonce seul ; un `aria-describedby` pointant
          sur un identifiant que personne ne rend serait une référence brisée, pas une aide. */}
      <div>
        <OtpInput
          // Remonté à neuf quand la longueur change, et après chaque refus : les cases repartent
          // vides plutôt que de garder un code faux que l'utilisateur devrait effacer lui-même.
          key={`${String(flow.codeLength)}-${String(flow.attempt)}`}
          length={flow.codeLength}
          label="Code reçu par email"
          disabled={busy}
          onType={flow.clearError}
          onComplete={(code) => {
            void flow.submitCode(code)
          }}
        />
      </div>

      <p className="text-center text-xs text-ink-muted" aria-live="polite">
        {busy ? 'Vérification en cours…' : 'La saisie du dernier caractère valide le code.'}
      </p>

      <div className="mt-6 flex flex-col items-center gap-3 text-[0.9375rem]">
        <button
          type="button"
          onClick={() => {
            void flow.resendCode()
          }}
          disabled={busy}
          className="min-h-11 font-semibold text-primary hover:underline disabled:opacity-60"
        >
          Renvoyer un code
        </button>
        <button
          type="button"
          onClick={flow.backToForm}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-1.5 text-ink-muted hover:text-primary disabled:opacity-60"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          Retour au formulaire
        </button>
      </div>
    </AuthCard>
  )
}

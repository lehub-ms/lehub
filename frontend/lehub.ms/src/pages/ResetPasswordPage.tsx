import { ArrowLeft, ArrowRight, Mail } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router'
import { useResetFlow } from '@/auth/useResetFlow'
import { AuthCard } from '@/components/auth/AuthCard'
import { Alert } from '@/components/form/Alert'
import { Field } from '@/components/form/Field'
import { OtpInput } from '@/components/form/OtpInput'
import { PasswordInput } from '@/components/form/PasswordInput'
import { cn } from '@/lib/cn'
import { BUTTON_BLOCK, BUTTON_BLOCK_PRIMARY, INPUT_BASE } from '@/lib/form-styles'
import { PATHS } from '@/lib/navigation'

/**
 * Réinitialiser son mot de passe en trois écrans, sans jamais quitter le domaine.
 *
 * Une seule carte, trois contenus, comme la maquette : l'adresse, le code, le nouveau mot de
 * passe. Le succès reconnecte directement plutôt que de renvoyer au formulaire de connexion —
 * le tenant émet des jetons à l'issue de la réinitialisation, et ne pas s'en servir
 * demanderait à l'utilisateur de ressaisir ce qu'il vient de choisir.
 */
export function ResetPasswordPage(): ReactNode {
  const flow = useResetFlow()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (flow.stage === 'done') return <Navigate to={PATHS.home} replace />

  const busy = flow.stage === 'submitting'
  const backToSignIn = (
    <p className="mt-6 text-center text-[0.9375rem]">
      <Link
        to={PATHS.signIn}
        className="inline-flex min-h-11 items-center gap-1.5 text-ink-muted hover:text-primary"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        Retour à la connexion
      </Link>
    </p>
  )

  if (flow.stage === 'email' || (busy && !flow.targetLabel)) {
    return (
      <AuthCard
        titleId="reset-title"
        title="Mot de passe oublié"
        subtitle="Saisissez votre email. Nous vous enverrons un code à usage unique pour définir un nouveau mot de passe."
      >
        {flow.error ? <Alert tone="error">{flow.error}</Alert> : null}

        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            void flow.requestCode(email)
          }}
          noValidate
        >
          <Field
            htmlFor="reset-email"
            label="Adresse email"
            hint="Nous enverrons un code à usage unique, valable quelques minutes."
          >
            <input
              id="reset-email"
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

          <button
            type="submit"
            className={cn(BUTTON_BLOCK, BUTTON_BLOCK_PRIMARY, 'mt-2')}
            disabled={busy}
          >
            <Mail aria-hidden="true" className="size-[18px]" />
            {busy ? 'Envoi en cours…' : 'Envoyer le code de réinitialisation'}
          </button>
        </form>
        {backToSignIn}
      </AuthCard>
    )
  }

  if (flow.stage === 'code' || (busy && flow.targetLabel && !password)) {
    return (
      <AuthCard
        titleId="reset-otp-title"
        title="Entrez le code reçu"
        subtitle={
          <>
            Un code a été envoyé à <strong className="text-ink">{flow.targetLabel}</strong>.
            Saisissez-le pour poursuivre la réinitialisation.
          </>
        }
      >
        {/* Le message est le même que l'adresse soit connue ou non. C'est la constante
            partagée avec la table de messages, pas une phrase écrite deux fois. */}
        {flow.notice ? <Alert tone="info">{flow.notice}</Alert> : null}
        {flow.error ? <Alert tone="error">{flow.error}</Alert> : null}

        <OtpInput
          key={flow.codeLength}
          length={flow.codeLength}
          label="Code de vérification"
          disabled={busy}
          onType={flow.clearError}
          onComplete={(code) => {
            void flow.submitCode(code)
          }}
        />
        <p className="text-center text-xs text-ink-muted" aria-live="polite">
          {busy ? 'Vérification en cours…' : 'La saisie du dernier caractère valide le code.'}
        </p>
        {backToSignIn}
      </AuthCard>
    )
  }

  return (
    <AuthCard
      titleId="reset-password-title"
      title="Nouveau mot de passe"
      subtitle="Choisissez un nouveau mot de passe fort pour votre compte."
    >
      {flow.error ? <Alert tone="error">{flow.error}</Alert> : null}

      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          void flow.submitPassword(password)
        }}
        noValidate
      >
        <Field htmlFor="reset-new-password" label="Nouveau mot de passe">
          <PasswordInput
            id="reset-new-password"
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
          {/* Le tenant applique le changement de façon asynchrone : l'écran attend
              explicitement plutôt que de conclure à un échec. */}
          {busy ? 'Application en cours…' : 'Définir mon nouveau mot de passe'}
          <ArrowRight aria-hidden="true" className="size-[18px]" />
        </button>
      </form>
      {backToSignIn}
    </AuthCard>
  )
}

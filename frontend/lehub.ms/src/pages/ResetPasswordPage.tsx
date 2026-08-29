import { ArrowLeft } from 'lucide-react'
import { useCallback, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { ResetPasswordPage as SharedResetPasswordPage } from '@shared/pages/ResetPasswordPage'
import { PATHS } from '@/lib/navigation'

/**
 * Le parcours vient du socle partagé ; la navigation reste ici, parce que les routes sont
 * propres à cette application — et parce que le socle n'a pas `react-router` à sa portée.
 */
export function ResetPasswordPage(): ReactNode {
  const navigate = useNavigate()
  const onDone = useCallback(() => {
    void navigate(PATHS.home, { replace: true })
  }, [navigate])

  return (
    <SharedResetPasswordPage
      onDone={onDone}
      backToSignIn={
        <p className="mt-6 text-center text-[0.9375rem]">
          <Link
            to={PATHS.signIn}
            className="inline-flex min-h-11 items-center gap-1.5 text-ink-muted hover:text-primary"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            Retour à la connexion
          </Link>
        </p>
      }
    />
  )
}

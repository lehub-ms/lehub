import { WifiOff } from 'lucide-react'
import { ApiError } from '../lib/api'
import { EmptyState } from './EmptyState'

interface ErrorStateProps {
  /**
   * Required, and it was not when this lived in the public site: it defaulted to "Impossible de
   * charger les évènements", which is a trap in a component both applications call. A backoffice
   * screen failing to load its referential would have announced an event problem.
   */
  title: string
  error: unknown
  onRetry?: () => void
}

/**
 * Graceful fallback for a failed read — never lets an API error crash the page.
 * `ApiError.status === 0` means the request never reached the server (network or CORS
 * failure); any other status is a server-side error. Both read the same to a visitor, so
 * the message doesn't distinguish them.
 */
export function ErrorState({ title, error, onRetry }: ErrorStateProps) {
  const description = error instanceof ApiError ? error.message : "Une erreur inattendue s'est produite."

  return (
    <EmptyState
      icon={WifiOff}
      title={title}
      description={description}
      action={onRetry ? { label: 'Réessayer', onClick: onRetry } : undefined}
    />
  )
}

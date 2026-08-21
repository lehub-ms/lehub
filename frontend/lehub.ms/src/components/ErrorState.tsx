import { WifiOff } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { EmptyState } from './EmptyState'

interface ErrorStateProps {
  error: unknown
  onRetry?: () => void
}

/**
 * Graceful fallback for a failed `GET /api/events` — never lets the API error crash the
 * page. `ApiError.status === 0` means the request never reached the server (network or
 * CORS failure); any other status is a server-side error. Both read the same to a
 * visitor, so the message doesn't distinguish them.
 */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const description =
    error instanceof ApiError
      ? error.message
      : "Une erreur inattendue s'est produite."

  return (
    <EmptyState
      icon={WifiOff}
      title="Impossible de charger les évènements"
      description={description}
      action={onRetry ? { label: 'Réessayer', onClick: onRetry } : undefined}
    />
  )
}

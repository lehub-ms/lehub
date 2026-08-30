/**
 * Les routes propres au backoffice. Le transport — `apiFetch`, `ApiError`, l'ouverture de
 * session — vient de `@lehub/shared/lib/api`, partagé avec le site public : les deux applications
 * parlent à la même Function App, en cross-origin, et rien de ce fichier n'est une décision
 * de confiance. L'API arbitre (#109).
 */
import { apiFetch } from '@lehub/shared/lib/api'

export { ApiError, apiFetch, openSession, type OpenedSession } from '@lehub/shared/lib/api'

export interface HealthStatus {
  status: string
  sqlConfigured: boolean
  mediaConfigured: boolean
  timestamp: string
}

export function getHealth(): Promise<HealthStatus> {
  return apiFetch<HealthStatus>('/api/health')
}

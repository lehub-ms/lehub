import { createRequireSession } from '@lehub/shared/components/RequireSession'
import { PATHS } from '@/lib/navigation'

/**
 * La garde du backoffice. Le raisonnement vit dans le socle, avec la fabrique — les deux
 * applications posent la même garde, et seule l'adresse de connexion les distingue.
 */
export const RequireSession = createRequireSession(PATHS.signIn)

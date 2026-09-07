import { createRequireSession } from '@lehub/shared/components/RequireSession'
import { PATHS } from '@/lib/navigation'

/**
 * La garde du site public. Le raisonnement vit dans le socle, avec la fabrique.
 *
 * Contrairement au backoffice, elle ne porte pas toutes les routes : l'agenda est public, et
 * c'est le sujet du site. Elle ne couvre que ce qui appartient à un compte.
 */
export const RequireSession = createRequireSession(PATHS.signIn)

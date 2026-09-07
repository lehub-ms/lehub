import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { errorResponse, listFetchError, routeLabel } from '../lib/httpErrors'
import { SAVE_PREFERENCES } from '../lib/preferenceSchemas'
import {
  deletePreferences,
  readPreferences,
  replacePreferences,
  type SavedPreferences,
} from '../lib/preferencesRepo'
import { type AuthenticatedIdentity } from '../lib/tokenValidation'
import { parseBody } from '../lib/validation'
import { withAuth } from '../lib/withAuth'

/**
 * Ce qu'un compte suit : lire, remplacer, supprimer.
 *
 * `withAuth` et délibérément pas `withAuthorization` : la route ne porte aucun identifiant, et le
 * seul qu'elle utilise est `identity.objectId`, pris sur le jeton validé. Il n'y a donc aucun
 * autre compte sur lequel opérer, et rien à habiliter — l'isolation est une propriété de la
 * route, pas un contrôle qu'elle exécute. Un corps qui tenterait de nommer un autre compte est
 * refusé par le `strictObject` du schéma, qui rejette toute clé non reconnue.
 *
 * `saved` porte à lui seul la distinction que #191 demande. Une sélection vide enregistrée vaut
 * « tous les évènements » et n'est pas une absence de préférences : le client ne l'infère jamais
 * de la longueur des tableaux, il la lit.
 */
interface PreferencesBody {
  saved: boolean
  communities: SavedPreferences['communities']
  technologies: SavedPreferences['technologies']
}

function body(preferences: SavedPreferences | null): PreferencesBody {
  return {
    saved: preferences !== null,
    communities: preferences?.communities ?? [],
    technologies: preferences?.technologies ?? [],
  }
}

export async function mePreferences(
  request: HttpRequest,
  context: InvocationContext,
  identity: AuthenticatedIdentity,
): Promise<HttpResponseInit> {
  if (request.method === 'GET') return read(context, identity.objectId)
  if (request.method === 'DELETE') return remove(context, identity.objectId)
  return save(request, context, identity.objectId)
}

async function read(context: InvocationContext, objectId: string): Promise<HttpResponseInit> {
  let preferences
  try {
    preferences = await readPreferences(objectId)
  } catch (error) {
    return listFetchError(
      context,
      'Failed to read the event preferences',
      error,
      'PREFERENCES_READ_ERROR',
      'Unable to read the preferences.',
    )
  }

  return { status: 200, jsonBody: body(preferences) }
}

async function save(
  request: HttpRequest,
  context: InvocationContext,
  objectId: string,
): Promise<HttpResponseInit> {
  const parsed = await parseBody(request, context, SAVE_PREFERENCES)
  if (!parsed.ok) return parsed.response

  let result
  try {
    result = await replacePreferences(objectId, parsed.value)
  } catch (error) {
    return listFetchError(
      context,
      'Failed to save the event preferences',
      error,
      'PREFERENCES_WRITE_ERROR',
      'Unable to save the preferences.',
    )
  }

  if (!result.ok) {
    if (result.error === 'account-not-found') {
      // Le jeton est valide, la ligne miroir n'existe pas : `me/session` n'a jamais été appelé
      // pour ce compte. Rien n'a été écrit, et le client a une action utile — ouvrir sa session.
      context.error('Refused to save preferences for an unmirrored account', { objectId })
      return errorResponse(409, 'ACCOUNT_NOT_MIRRORED', 'This account has no LeHub mirror row yet.')
    }

    // 409 et non 400 : le corps était parfaitement formé, c'est le référentiel qui a bougé
    // dessous. Les identifiants fautifs voyagent pour que l'écran puisse en faire une phrase —
    // la même accommodation que `REFERENCE_IN_USE`.
    context.error('Refused a preference selection naming entries no longer offered', {
      route: routeLabel(request),
      objectId,
      unknown: result.unknown,
    })
    return {
      status: 409,
      jsonBody: {
        code: 'PREFERENCE_REFERENCE_UNKNOWN',
        message: 'A selected entry no longer exists or has been archived.',
        unknownCommunityIds: result.unknown
          .filter((entry) => entry.dimension === 'community')
          .map((entry) => entry.id),
        unknownTechnologyIds: result.unknown
          .filter((entry) => entry.dimension === 'technology')
          .map((entry) => entry.id),
      },
    }
  }

  return { status: 200, jsonBody: body(result.preferences) }
}

async function remove(context: InvocationContext, objectId: string): Promise<HttpResponseInit> {
  try {
    await deletePreferences(objectId)
  } catch (error) {
    return listFetchError(
      context,
      'Failed to delete the event preferences',
      error,
      'PREFERENCES_WRITE_ERROR',
      'Unable to delete the preferences.',
    )
  }

  return { status: 204 }
}

// `authLevel: 'anonymous'` porte sur les clés de fonction de l'hôte, que cette API n'utilise
// nulle part. La garde de cette route est `withAuth`, et c'est la seule — voir session.ts.
app.http('mePreferences', {
  methods: ['GET', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  route: 'me/preferences',
  handler: withAuth(mePreferences),
})

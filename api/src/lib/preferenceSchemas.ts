import { z } from 'zod'

/**
 * Le corps que `PUT /api/me/preferences` accepte : la sélection complète, jamais un écart.
 *
 * Le remplacement est intégral (#191) parce qu'un écart soumis se lit toujours par rapport à un
 * état que le client croit connaître, et deux onglets ouverts n'ont pas le même. La sélection
 * entière, elle, n'a pas de préalable : la dernière écriture gagne, ce qui est exactement le
 * comportement que la Story demande.
 *
 * `z.guid()` et délibérément pas `z.uuid()` : `UNIQUEIDENTIFIER` accepte n'importe quels 128
 * bits, et les référentiels de ce dépôt sont pleins d'identifiants hors RFC 4122. Le
 * raisonnement complet est dans `lib/validation.ts`, qui fait le même choix pour les paramètres
 * de route.
 *
 * `strictObject` : une clé non reconnue est refusée plutôt qu'ignorée. C'est aussi ce qui fait
 * qu'un corps portant un `objectId` ou un `userId` — une tentative d'écrire sur un autre compte —
 * est rejeté par le schéma avant d'atteindre le moindre code, et non silencieusement dépouillé.
 */

/**
 * Les deux dimensions du filtrage. Bornées parce qu'un tableau sans plafond finit dans
 * `OPENJSON` : le référentiel compte quelques dizaines d'entrées, deux cents est déjà hors de
 * portée d'une sélection humaine tout en refusant un corps construit pour peser.
 */
const referenceIds = z.array(z.guid()).max(200).default([])

export const SAVE_PREFERENCES = z
  .strictObject({
    communityIds: referenceIds,
    technologyIds: referenceIds,
  })
  .meta({
    id: 'SavePreferences',
    title: 'Enregistrement des préférences d’évènements',
    description:
      'Le corps attendu par PUT /api/me/preferences. Une sélection vide est légitime : elle vaut « tous les évènements ».',
  })

/**
 * Énuméré pour que le test de dérivation couvre chaque schéma par construction — voir
 * `referenceSchemas.ts`, dont ce tableau est le pendant. Ajouter un schéma, c'est l'ajouter ici.
 */
export const PREFERENCE_SCHEMAS = [SAVE_PREFERENCES] as const

export type SavePreferencesBody = z.infer<typeof SAVE_PREFERENCES>

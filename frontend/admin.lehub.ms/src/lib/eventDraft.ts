import { fromLocalInput } from './eventDates'

/**
 * Ce qu'un formulaire d'évènement porte pendant la saisie, et ce qu'il refuse.
 *
 * Module à part et non export d'un `.tsx` : `react-refresh/only-export-components` interdit à un
 * fichier de composant d'exporter autre chose que des composants, et la validation n'en est pas
 * un. C'est la même raison qui a sorti `words.ts` de `ResultCount`.
 */

/** L'état de saisie, en **heure murale** : ce que les champs portent, pas ce que l'API reçoit. */
export interface EventDraft {
  title: string
  description: string
  /** `AAAA-MM-JJTHH:MM`, lu comme une heure de Paris. */
  startLocal: string
  endLocal: string
  formatTypeId: string
  eventModeId: string
  /** Les rattachements cochés. Remplacent l'ensemble à l'enregistrement, jamais s'y ajoutent. */
  communityIds: string[]
  technologyIds: string[]
}

export const EMPTY_DRAFT: EventDraft = {
  title: '',
  description: '',
  startLocal: '',
  endLocal: '',
  formatTypeId: '',
  eventModeId: '',
  communityIds: [],
  technologyIds: [],
}

/** Ce que l'enregistrement reçoit : les dates converties, la description normalisée. */
export interface EventFormValues {
  title: string
  description: string | null
  startDate: string
  endDate: string
  formatTypeId: string
  eventModeId: string
  communityIds: string[]
  technologyIds: string[]
}

export type FieldKey = 'title' | 'startLocal' | 'endLocal' | 'formatTypeId' | 'eventModeId'

/** Les champs dans l'ordre de l'écran : le premier fautif est celui qu'on signale. */
export const FIELD_ORDER: readonly FieldKey[] = [
  'title',
  'startLocal',
  'endLocal',
  'formatTypeId',
  'eventModeId',
]

const MESSAGES: Record<FieldKey, string> = {
  title: 'Le titre est obligatoire.',
  startLocal: 'La date de début est obligatoire.',
  endLocal: 'La date de fin est obligatoire.',
  formatTypeId: 'Le type est obligatoire.',
  eventModeId: 'Le format est obligatoire.',
}

export const END_BEFORE_START = 'La date de fin doit être postérieure à la date de début.'

/**
 * Ce que le formulaire refuse avant d'appeler l'API.
 *
 * **Une première ligne, jamais la seule.** Le serveur revalide tout (`api/src/lib/
 * eventSchemas.ts`) et c'est lui qui décide ; ceci évite un aller-retour et permet de désigner le
 * champ fautif, ce qu'un refus HTTP ne sait pas faire.
 *
 * Pure, donc éprouvable sans monter d'écran.
 */
export function validateDraft(draft: EventDraft): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {}

  if (!draft.title.trim()) errors.title = MESSAGES.title
  if (!draft.startLocal) errors.startLocal = MESSAGES.startLocal
  if (!draft.endLocal) errors.endLocal = MESSAGES.endLocal
  if (!draft.formatTypeId) errors.formatTypeId = MESSAGES.formatTypeId
  if (!draft.eventModeId) errors.eventModeId = MESSAGES.eventModeId

  // Comparées comme instants et non comme chaînes : deux heures murales de part et d'autre
  // d'une bascule d'heure ne se rangent pas dans l'ordre de leur écriture.
  if (!errors.startLocal && !errors.endLocal) {
    const start = fromLocalInput(draft.startLocal)
    const end = fromLocalInput(draft.endLocal)
    if (start && end && Date.parse(end) < Date.parse(start)) errors.endLocal = END_BEFORE_START
  }

  return errors
}

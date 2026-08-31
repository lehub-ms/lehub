import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@lehub/shared/components/Button'
import { CommunityAvatar } from '@lehub/shared/components/entities/CommunityAvatar'
import { TechnologyAvatar } from '@lehub/shared/components/entities/TechnologyAvatar'
import { Field } from '@lehub/shared/components/form/Field'
import { cn } from '@lehub/shared/lib/cn'
import { errorId } from '@lehub/shared/lib/fieldIds'
import { INPUT_BASE } from '@lehub/shared/lib/form-styles'
import { ChipPicker, type ChipEntry } from '@/components/events/ChipPicker'
import type { EventOptions } from '@/lib/api'
import { SHARING_NOTE } from '@/lib/eventAttachments'
import { fromLocalInput } from '@/lib/eventDates'
import {
  FIELD_ORDER,
  validateDraft,
  type EventDraft,
  type EventFormValues,
  type FieldKey,
} from '@/lib/eventDraft'
import { FORMAT_LABEL, TYPE_HINT, TYPE_LABEL } from '@/lib/eventVocabulary'

interface EventFormProps {
  draft: EventDraft
  onDraftChange: (draft: EventDraft) => void
  options: EventOptions
  /** Le refus rendu par l'API, en français, au-dessus de la barre d'action. */
  submitError?: string | null
  pending: boolean
  submitLabel: string
  onSubmit: (values: EventFormValues) => void
  onCancel: () => void
  /** Les pastilles déjà arbitrées : ce qui se retire, et à quel prix. Voir `eventAttachments`. */
  communityChips: readonly ChipEntry[]
  technologyChips: readonly ChipEntry[]
  /** L'action destructrice, absente en création (#146). */
  destructiveAction?: ReactNode
}

/**
 * Le formulaire d'un évènement : trois blocs, et une barre d'action fixe.
 *
 * Il ne connaît ni la création ni la modification — il reçoit un brouillon, en rend un, et
 * laisse la page décider de ce qu'elle en fait. C'est ce qui permet à #145 et #146 de partager
 * exactement le même écran, la présence de l'action destructrice étant la seule différence
 * visible entre les deux.
 */
export function EventForm({
  draft,
  onDraftChange,
  options,
  submitError,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
  communityChips,
  technologyChips,
  destructiveAction,
}: EventFormProps): ReactNode {
  const ids = useId()
  // Sur toutes les clés du brouillon, pas seulement celles qui se refusent : la description a
  // besoin d'un identifiant pour son étiquette, mais d'aucun message d'erreur.
  const field = (key: keyof EventDraft): string => `${ids}-${key}`
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const form = useRef<HTMLFormElement>(null)

  function set<K extends keyof EventDraft>(key: K, value: EventDraft[K]): void {
    onDraftChange({ ...draft, [key]: value })
    // L'erreur d'un champ disparaît dès qu'on le corrige : la laisser affichée sous un champ
    // qu'on vient de remplir est un reproche qui ne vaut plus.
    setErrors((current) => {
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key as FieldKey]
      return next
    })
  }

  function submit(event: FormEvent): void {
    event.preventDefault()

    const found = validateDraft(draft)
    setErrors(found)

    const first = FIELD_ORDER.find((key) => key in found)
    if (first) {
      // Le premier champ fautif est focalisé, ce que #145 demande nommément. Le groupe du
      // format n'est pas un contrôle unique : c'est sa première option qui reçoit le focus,
      // et c'est le point d'entrée clavier d'un `radiogroup`.
      const target = form.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)
      target?.focus()
      return
    }

    const startDate = fromLocalInput(draft.startLocal)
    const endDate = fromLocalInput(draft.endLocal)
    // `validate` a déjà écarté les valeurs illisibles ; la garde est ici pour le type, et
    // parce qu'un champ vidé entre les deux ne doit pas produire un `null` envoyé à l'API.
    if (!startDate || !endDate) return

    onSubmit({
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      startDate,
      endDate,
      formatTypeId: draft.formatTypeId,
      eventModeId: draft.eventModeId,
      communityIds: draft.communityIds,
      technologyIds: draft.technologyIds,
    })
  }

  const described = (key: FieldKey): string | undefined =>
    errors[key] ? errorId(field(key)) : undefined

  return (
    <form ref={form} noValidate onSubmit={submit} className="pb-28">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <section className="glass rounded-2xl p-5 sm:p-6">
            <header className="mb-5">
              <h2 className="font-heading text-lg font-semibold text-ink">Informations</h2>
              <p className="mt-1 text-[0.8125rem] text-ink-muted">
                Ce que les visiteurs voient en premier.
              </p>
            </header>

            <Field htmlFor={field('title')} label="Titre *" error={errors.title ?? null}>
              <input
                id={field('title')}
                data-field="title"
                type="text"
                value={draft.title}
                maxLength={300}
                aria-invalid={Boolean(errors.title)}
                aria-describedby={described('title')}
                onChange={(event) => {
                  set('title', event.target.value)
                }}
                className={INPUT_BASE}
              />
            </Field>

            <Field htmlFor={field('description')} label="Description">
              <textarea
                id={field('description')}
                rows={6}
                value={draft.description}
                onChange={(event) => {
                  set('description', event.target.value)
                }}
                className={cn(INPUT_BASE, 'resize-y')}
              />
            </Field>
          </section>

          <section className="glass rounded-2xl p-5 sm:p-6">
            <header className="mb-5">
              <h2 className="font-heading text-lg font-semibold text-ink">Dates &amp; format</h2>
              <p className="mt-1 text-[0.8125rem] text-ink-muted">
                Saisies et interprétées dans le fuseau Europe/Paris.
              </p>
            </header>

            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field htmlFor={field('startLocal')} label="Début *" error={errors.startLocal ?? null}>
                <input
                  id={field('startLocal')}
                  data-field="startLocal"
                  type="datetime-local"
                  value={draft.startLocal}
                  aria-invalid={Boolean(errors.startLocal)}
                  aria-describedby={described('startLocal')}
                  onChange={(event) => {
                    set('startLocal', event.target.value)
                  }}
                  className={INPUT_BASE}
                />
              </Field>

              <Field htmlFor={field('endLocal')} label="Fin *" error={errors.endLocal ?? null}>
                <input
                  id={field('endLocal')}
                  data-field="endLocal"
                  type="datetime-local"
                  value={draft.endLocal}
                  aria-invalid={Boolean(errors.endLocal)}
                  aria-describedby={described('endLocal')}
                  onChange={(event) => {
                    set('endLocal', event.target.value)
                  }}
                  className={INPUT_BASE}
                />
              </Field>
            </div>

            <Field
              htmlFor={field('formatTypeId')}
              label={`${TYPE_LABEL} *`}
              hint={TYPE_HINT}
              error={errors.formatTypeId ?? null}
            >
              {/* Une liste déroulante et non un contrôle segmenté : le référentiel en compte
                  six, là où le format en compte trois. */}
              <select
                id={field('formatTypeId')}
                data-field="formatTypeId"
                value={draft.formatTypeId}
                aria-invalid={Boolean(errors.formatTypeId)}
                aria-describedby={described('formatTypeId')}
                onChange={(event) => {
                  set('formatTypeId', event.target.value)
                }}
                className={INPUT_BASE}
              >
                <option value="">Choisir un type…</option>
                {options.formats.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              htmlFor={field('eventModeId')}
              label={`${FORMAT_LABEL} *`}
              error={errors.eventModeId ?? null}
            >
              {/* Un vrai `radiogroup` : trois options exclusives, atteignables au clavier et
                  annoncées comme un choix unique. `htmlFor` pointe le groupe, dont le premier
                  bouton porte l'identifiant — c'est lui que le focus vise. */}
              <div
                role="radiogroup"
                aria-label={FORMAT_LABEL}
                aria-invalid={Boolean(errors.eventModeId)}
                aria-describedby={described('eventModeId')}
                className="flex w-full overflow-hidden rounded-[10px] border-[1.5px] border-[#e2e8f0] bg-white"
              >
                {options.modes.map((option, index) => {
                  const selected = draft.eventModeId === option.id
                  return (
                    <button
                      key={option.id}
                      {...(index === 0 ? { id: field('eventModeId'), 'data-field': 'eventModeId' } : {})}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        set('eventModeId', option.id)
                      }}
                      className={cn(
                        'min-h-11 flex-1 border-r border-[#e2e8f0] px-4 text-sm font-semibold transition-colors last:border-r-0',
                        selected ? 'bg-primary-xs text-primary' : 'text-ink-muted hover:text-ink',
                      )}
                    >
                      {option.name}
                    </button>
                  )
                })}
              </div>
            </Field>
          </section>

          <section className="glass rounded-2xl p-5 sm:p-6">
            <header className="mb-5">
              <h2 className="font-heading text-lg font-semibold text-ink">Rattachements</h2>
              <p className="mt-1 text-[0.8125rem] text-ink-muted">
                Ils servent aux filtres et aux recommandations sur lehub.ms.
              </p>
            </header>

            <ChipPicker
              legend="Technologies"
              entries={technologyChips}
              selected={draft.technologyIds}
              onChange={(ids) => {
                set('technologyIds', ids)
              }}
              renderAvatar={(entry) => (
                <TechnologyAvatar technology={entry} size={18} hidden className="rounded" />
              )}
              emptyLabel="Aucune technologie au référentiel pour l’instant."
            />

            <ChipPicker
              legend="Communautés"
              note={SHARING_NOTE}
              entries={communityChips}
              selected={draft.communityIds}
              onChange={(ids) => {
                set('communityIds', ids)
              }}
              renderAvatar={(entry) => (
                <CommunityAvatar community={entry} size={18} hidden className="rounded-full" />
              )}
              emptyLabel="Aucune communauté au référentiel pour l’instant."
            />
          </section>
        </div>

        <div className="flex flex-col gap-6" />
      </div>

      {/* Barre d'action fixe : elle suit le défilement d'un formulaire long, pour qu'on n'ait
          jamais à chercher où enregistrer. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-primary/12 bg-white/95 px-4 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          {destructiveAction}
          <span className="flex-1" />
          {submitError ? (
            <p role="alert" className="text-[0.8125rem] font-medium text-[#b91c1c]">
              {submitError}
            </p>
          ) : null}
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Annuler
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Enregistrement…' : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}

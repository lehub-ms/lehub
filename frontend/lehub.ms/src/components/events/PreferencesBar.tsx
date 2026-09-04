import { useEffect, useRef, useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { Check, ChevronDown, Star } from 'lucide-react'
import { Button } from '@lehub/shared/components/Button'
import { ApiError } from '@lehub/shared/lib/api'
import { cn } from '@lehub/shared/lib/cn'
import { useFooterOverlap } from '@/hooks/useFooterOverlap'
import { NARROW_MEDIA_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { saveMyPreferences, type EventPreferences } from '@/lib/api'
import {
  diffFilterSelection,
  sameFilterSelection,
  summarizeSelection,
  type EventFilterSelection,
  type FilterDiffEntry,
} from '@/lib/eventFilters'

export interface PreferencesBarProps {
  /** La sélection enregistrée, ou `null` quand le compte n'a encore rien enregistré. */
  savedSelection: EventFilterSelection | null
  selection: EventFilterSelection
  /** Identifiant → nom : les options du filtrage, complétées par les entrées enregistrées. */
  names: ReadonlyMap<string, string>
  /** Revenir à la sélection enregistrée. */
  onRestore: () => void
  onSaved: (preferences: EventPreferences) => void
  /** La session a expiré en cours de route : il n'y a plus rien à enregistrer ici. */
  onSessionExpired: () => void
  /**
   * La hauteur que la page doit réserver sous la liste — celle de l'encart quand il est ancré,
   * zéro quand la barre est dans le flux. Sans elle, les derniers évènements resteraient
   * définitivement cachés derrière l'encart.
   */
  onReservedHeightChange: (height: number) => void
}

type Confirmation = 'created' | 'updated'

/**
 * La barre « Mes préférences », sous session uniquement.
 *
 * Trois états **dérivés** et jamais stockés : sans préférence enregistrée elle propose
 * d'enregistrer ; avec une sélection identique elle confirme ; dès que la sélection diverge elle
 * énumère l'écart. Un état stocké se désynchroniserait de la sélection au premier chemin oublié.
 *
 * L'écart est énuméré entrée par entrée plutôt que résumé par un compte : un compte dit qu'il y a
 * une différence, l'énumération dit laquelle — c'est ce qui permet de décider d'enregistrer ou de
 * revenir sans comparer deux listes de mémoire.
 *
 * Ce que les maquettes portent et qui n'est pas rendu ici : le CTA « Obtenir mon lien d'agenda »
 * de l'état au repos. La Feature « Mon lien d'agenda iCal » n'est pas livrée, et #189 interdit
 * d'en promettre quoi que ce soit d'ici là.
 */
export function PreferencesBar({
  savedSelection,
  selection,
  names,
  onRestore,
  onSaved,
  onSessionExpired,
  onReservedHeightChange,
}: PreferencesBarProps) {
  const statusRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLElement>(null)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [open, setOpen] = useState(true)

  const narrow = useMediaQuery(NARROW_MEDIA_QUERY)
  const footerOverlap = useFooterOverlap(narrow)

  const applied = savedSelection !== null && sameFilterSelection(savedSelection, selection)
  const diverging = savedSelection !== null && !applied
  const diff = diverging ? diffFilterSelection(savedSelection, selection, names) : null

  /**
   * Le libellé de la poignée reprend l'état courant.
   *
   * Replié, l'encart doit encore dire de quoi il s'agit **et** s'il y a quelque chose à
   * enregistrer : sans cela, il ne resterait qu'une bande muette qu'on apprend à ignorer.
   */
  const handleLabel =
    savedSelection === null
      ? 'Enregistrer ces filtres'
      : applied
        ? 'Mes préférences appliquées'
        : 'Filtres modifiés — non enregistré'

  useEffect(() => {
    const element = rootRef.current
    if (!element) return

    if (!narrow) {
      // Dans le flux, l'encart occupe déjà sa place : réserver en plus la doublerait.
      onReservedHeightChange(0)
      return
    }

    const observer = new ResizeObserver(() => {
      onReservedHeightChange(element.getBoundingClientRect().height)
    })
    observer.observe(element)
    onReservedHeightChange(element.getBoundingClientRect().height)

    return () => {
      observer.disconnect()
      onReservedHeightChange(0)
    }
  }, [narrow, onReservedHeightChange])

  async function save() {
    setPending(true)
    setFailure(null)
    try {
      const preferences = await saveMyPreferences({
        communityIds: selection.communityIds,
        technologyIds: selection.technologyIds,
      })
      const first = savedSelection === null
      onSaved(preferences)
      setConfirmation(first ? 'created' : 'updated')
      // Le bouton qui vient d'être actionné disparaît avec l'état A ou C. Sans ce déplacement, le
      // focus retomberait sur `<body>` et la navigation au clavier repartirait du début du document.
      statusRef.current?.focus()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired()
        return
      }
      // La sélection courante n'est pas perdue : la barre reste en divergence, et le message dit
      // quoi faire plutôt que ce qui a cassé.
      setFailure(
        error instanceof ApiError && error.code === 'PREFERENCE_REFERENCE_UNKNOWN'
          ? 'Une entrée de votre sélection n’existe plus. Rechargez la page pour repartir de ce qui est proposé.'
          : 'Vos préférences n’ont pas pu être enregistrées. Réessayez dans un instant.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Collapsible.Root
      // Au large il n'y a rien à replier : le contenu est toujours ouvert et aucune poignée
      // n'est rendue — pas seulement masquée.
      open={narrow ? open : true}
      onOpenChange={setOpen}
      asChild
    >
      <section
        ref={rootRef}
        // Un libellé stable plutôt que le titre courant : le repère de navigation ne doit pas
        // changer de nom quand la sélection bouge.
        aria-label="Mes préférences"
        data-state={diverging ? 'diverge' : 'rest'}
        // `z-[280]` délibérément sous le tiroir de filtres mobile — son voile est à 290 et son
        // contenu à 300 — pour que le tiroir ouvert passe bien au-dessus de l'encart.
        style={narrow ? { bottom: footerOverlap } : undefined}
        className={cn(
          'glass-strong flex flex-col gap-2.5',
          narrow
            ? 'fixed inset-x-0 z-[280] rounded-t-[20px] border-b-0 px-4 pt-1.5 pb-[max(14px,calc(env(safe-area-inset-bottom)+14px))] shadow-[0_-6px_28px_rgb(0_95_184/0.14)]'
            : 'mt-8 rounded-2xl px-5 py-4',
          diverging && 'border-primary/28 bg-primary-xs',
        )}
      >
        {narrow && (
          <Collapsible.Trigger className="flex min-h-11 w-full items-center justify-between gap-2 text-sm font-semibold text-ink-muted">
            <span>{handleLabel}</span>
            <ChevronDown
              aria-hidden="true"
              className="size-[18px] shrink-0 transition-transform duration-200 data-[state=closed]:rotate-180"
            />
          </Collapsible.Trigger>
        )}

        <Collapsible.Content className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {/* Seuls le titre et le résumé sont annoncés : la barre entière se re-rend à chaque
                changement de case, et une région live posée dessus rejouerait tout à chaque fois. */}
            <div
              ref={statusRef}
              tabIndex={-1}
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="min-w-0 flex-1 outline-none"
            >
              <p className="flex flex-wrap items-center gap-2 font-heading text-base font-bold text-ink">
                {!diverging && <Star aria-hidden="true" className="size-[17px] shrink-0 fill-primary text-primary" />}
                {savedSelection === null
                  ? 'Enregistrer ces filtres'
                  : applied
                    ? 'Mes préférences'
                    : 'Filtres modifiés'}
                {applied && <span className="text-sm font-normal text-ink-muted">appliquées</span>}
                {diverging && (
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-[5px] text-xs font-semibold text-primary">
                    non enregistré
                  </span>
                )}
              </p>

              {!diverging && (
                <p className="mt-[3px] text-sm leading-normal text-ink-muted">
                  {savedSelection === null
                    ? `${summarizeSelection(selection)} — retrouvez cette sélection à chaque visite.`
                    : summarizeSelection(savedSelection)}
                </p>
              )}

              {diff !== null &&
                (diff.added.length > 0 || diff.removed.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {diff.added.map((entry) => (
                      <DiffChip key={`add-${entry.dimension}-${entry.id}`} entry={entry} operation="added" />
                    ))}
                    {diff.removed.map((entry) => (
                      <DiffChip key={`rem-${entry.dimension}-${entry.id}`} entry={entry} operation="removed" />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-[3px] text-sm leading-normal text-ink-muted">
                    {summarizeSelection(selection)}
                  </p>
                ))}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2.5">
              {!applied && (
                <Button
                  variant="primary"
                  disabled={pending}
                  onClick={() => void save()}
                  className="min-h-11 rounded-full bg-cta px-[18px] text-sm shadow-none hover:bg-cta-dark"
                >
                  {savedSelection === null
                    ? 'Enregistrer mes préférences'
                    : 'Mettre à jour mes préférences'}
                </Button>
              )}
              {diverging && (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={onRestore}
                  className="min-h-11 rounded-full px-[18px] text-sm"
                >
                  Revenir
                </Button>
              )}
            </div>
          </div>

          {failure !== null && (
            <p role="alert" className="text-sm text-red-700">
              {failure}
            </p>
          )}
        </Collapsible.Content>

        {confirmation !== null && (
          <PreferencesToast
            kind={confirmation}
            onDismiss={() => {
              setConfirmation(null)
            }}
          />
        )}
      </section>
    </Collapsible.Root>
  )
}

/**
 * Une entrée de l'écart.
 *
 * Distinguée deux fois sans la couleur : le préfixe « + » et le texte barré le disent à l'œil, le
 * mot en `sr-only` le dit aux technologies d'assistance. La couleur seule ne distingue rien pour
 * qui ne la perçoit pas.
 */
function DiffChip({
  entry,
  operation,
}: {
  entry: FilterDiffEntry
  operation: 'added' | 'removed'
}) {
  return (
    <li
      className={cn(
        'inline-flex items-center rounded-full border px-[11px] py-1 text-xs font-semibold',
        operation === 'added'
          ? 'border-primary/22 bg-white/75 text-primary'
          : 'border-ink-muted/28 bg-white/75 text-ink-muted line-through',
      )}
    >
      <span className="sr-only">{operation === 'added' ? 'Ajouté : ' : 'Retiré : '}</span>
      <span aria-hidden="true">{operation === 'added' ? '+ ' : ''}</span>
      {entry.name}
    </li>
  )
}

const CONFIRMATIONS: Record<Confirmation, { title: string; detail: string }> = {
  created: {
    title: 'Préférences enregistrées',
    // La maquette enchaîne ici sur le lien d'agenda. Tant que sa Feature n'est pas livrée, la
    // confirmation ne promet que ce qui vient d'arriver.
    detail: 'Elles sont appliquées à chaque visite.',
  },
  updated: {
    title: 'Préférences mises à jour',
    // La seule information que l'utilisateur n'a aucun moyen de deviner, et la seule qui
    // l'empêche de croire qu'il vient de casser son agenda.
    detail:
      'Aucun réabonnement nécessaire : les agendas déjà abonnés se mettent à jour automatiquement.',
  },
}

const TOAST_DURATION_MS = 6000

/**
 * La confirmation.
 *
 * En bas au large, **en haut sous 1024px** — là où l'encart fixe des préférences la
 * recouvrirait (#194). Non interactive : elle s'annonce, elle ne capture ni le focus ni le
 * pointeur, et elle s'efface d'elle-même.
 */
function PreferencesToast({ kind, onDismiss }: { kind: Confirmation; onDismiss: () => void }) {
  const { title, detail } = CONFIRMATIONS[kind]

  useEffect(() => {
    const timer = setTimeout(onDismiss, TOAST_DURATION_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [onDismiss])

  return (
    <div
      role="status"
      className="pointer-events-none fixed top-[84px] left-1/2 z-[320] flex max-w-[min(440px,calc(100vw-32px))] -translate-x-1/2 items-start gap-3 rounded-[14px] border border-primary/18 bg-white/96 px-[18px] py-3.5 shadow-[0_12px_40px_rgb(0_95_184/0.18)] backdrop-blur-[20px] lg:top-auto lg:bottom-7"
    >
      <span className="mt-px flex size-[26px] shrink-0 items-center justify-center rounded-full bg-primary-xs text-primary">
        <Check aria-hidden="true" className="size-[18px]" strokeWidth={2.2} />
      </span>
      <div>
        <p className="font-heading text-[0.9375rem] font-bold text-ink">{title}</p>
        <p className="mt-0.5 text-[0.8125rem] leading-normal text-ink-muted">{detail}</p>
      </div>
    </div>
  )
}

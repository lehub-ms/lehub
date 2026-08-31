import { useId, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { Alert } from '@lehub/shared/components/form/Alert'
import { Field } from '@lehub/shared/components/form/Field'
import { errorId, hintId } from '@lehub/shared/lib/fieldIds'
import { Button } from '@lehub/shared/components/Button'
import { cn } from '@lehub/shared/lib/cn'
import { INPUT_BASE } from '@lehub/shared/lib/form-styles'
import { CommunityAvatar } from '@lehub/shared/components/entities/CommunityAvatar'
import { TechnologyAvatar } from '@lehub/shared/components/entities/TechnologyAvatar'
import { SidePanel } from '@/components/overlays/SidePanel'
import { LogoField } from '@/components/reference/LogoField'
import { StatusField } from '@/components/reference/StatusField'
import { ApiError, type ReferenceStatus, type UploadDestination } from '@/lib/api'
import { isValidSlug, slugify, SLUG_MAX_LENGTH } from '@/lib/slug'
import { ConfirmDialog } from '@/components/overlays/ConfirmDialog'

/**
 * L'état d'ouverture du panneau : fermé, en création, ou en modification d'une entrée.
 *
 * Trois états dans une valeur plutôt que deux booléens et une entrée : « ouvert en création avec
 * une entrée sélectionnée » ne veut rien dire et n'est ici pas représentable.
 */
export type PanelState<T> = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; entry: T }

/** La description est bornée par la colonne — `NVARCHAR(300)`, migration 0002. */
export const DESCRIPTION_LIMIT = 300

export interface ReferenceDraft {
  name: string
  /** Seules les communautés en portent un (#166). */
  slug?: string
  description: string | null
  logoPath: string | null
  logoUrl: string | null
  status: ReferenceStatus
}

export interface ReferenceEntry extends ReferenceDraft {
  id: string
}

interface ReferencePanelProps {
  kind: 'community' | 'technology'
  /** `null` en création. Le panneau sert aux deux, et son titre dit lequel. */
  entry: ReferenceEntry | null
  open: boolean
  /**
   * Change à chaque ouverture. C'est la clé du formulaire : elle le remonte, donc remet sa
   * saisie à zéro, sans démonter le `Dialog` qui l'entoure — voir le commentaire du composant.
   */
  session: number
  onClose: () => void
  onSubmit: (draft: ReferenceDraft) => Promise<void>
  /** Rendu à gauche du pied, en modification seulement (#155). */
  destructiveAction?: ReactNode
  /** Le bouton qui a ouvert le panneau, à qui rendre le focus. Voir `SidePanel`. */
  restoreFocusTo?: RefObject<HTMLElement | null>
}

const COPY = {
  community: {
    create: 'Nouvelle communauté',
    edit: 'Modifier la communauté',
    createSubtitle: 'Ajouter une entrée au référentiel',
    namePlaceholder: 'Azure User Group France',
    destination: 'community-logo' as UploadDestination,
    taken: 'Une autre communauté porte déjà ce nom.',
  },
  technology: {
    create: 'Nouvelle technologie',
    edit: 'Modifier la technologie',
    createSubtitle: 'Ajouter une entrée au référentiel',
    namePlaceholder: 'Microsoft Fabric',
    destination: 'technology-logo' as UploadDestination,
    taken: 'Une autre technologie porte déjà ce nom.',
  },
} as const

function blank(): ReferenceDraft {
  // Active par défaut : c'est ce que #152 et #153 demandent d'une entrée créée.
  return { name: '', slug: '', description: null, logoPath: null, logoUrl: null, status: 'active' }
}

/**
 * Le panneau qui sert à la création comme à la modification, pour les deux référentiels.
 *
 * Un seul composant parce que les deux entités ne diffèrent que par un champ : une communauté
 * porte une description, une technologie non — elle étiquette un évènement, elle ne se raconte
 * pas. Faire deux panneaux pour cela reviendrait à recopier la gestion du logo, du statut, des
 * refus et du focus.
 *
 * **Le `Dialog` reste monté, le formulaire est remonté à chaque ouverture.** La distinction
 * n'est pas cosmétique : c'est en se démontant que Radix rend le focus au bouton qui l'avait
 * ouvert, et démonter tout l'ensemble d'un coup lui retire cette occasion — le focus retombe
 * alors sur `<body>`, et une personne au clavier se retrouve en haut du document. Remonter le
 * seul formulaire, par sa `key`, remet la saisie à zéro sans rien coûter au focus : c'est ce qui
 * rend vrai « panneau fermé sans enregistrer : aucune modification n'est conservée », et sans
 * `setState` dans un effet, que ce dépôt refuse — voir `useCommunities`.
 *
 * L'aperçu utilise le **même composant que le site public**, si bien que « ce qu'on voit dans le
 * panneau est ce que verra le site public » est vrai par construction et non par recopie. Il
 * suit le nom à la frappe, y compris la couleur de repli, que la graine tire du nom tant que
 * l'entrée n'a pas d'identifiant.
 */
export function ReferencePanel({
  kind,
  entry,
  open,
  session,
  onClose,
  onSubmit,
  destructiveAction,
  restoreFocusTo,
}: ReferencePanelProps): ReactNode {
  const copy = COPY[kind]

  return (
    <ReferenceForm
      // Remonté à chaque ouverture, et sur chaque entrée : la saisie repart de zéro.
      key={`${entry?.id ?? 'create'}-${String(session)}`}
      kind={kind}
      entry={entry}
      open={open}
      copy={copy}
      onClose={onClose}
      onSubmit={onSubmit}
      destructiveAction={destructiveAction}
      restoreFocusTo={restoreFocusTo}
    />
  )
}

interface ReferenceFormProps extends Omit<ReferencePanelProps, 'session'> {
  copy: (typeof COPY)[keyof typeof COPY]
}

function ReferenceForm({
  kind,
  entry,
  open,
  copy,
  onClose,
  onSubmit,
  destructiveAction,
  restoreFocusTo,
}: ReferenceFormProps): ReactNode {
  const nameId = useId()
  const descriptionId = useId()

  const [draft, setDraft] = useState<ReferenceDraft>(entry ?? blank())
  const [nameError, setNameError] = useState<string | null>(null)
  const [slugError, setSlugError] = useState<string | null>(null)
  // Vrai dès qu'on y touche : tant que non, le slug suit le nom à la frappe.
  const [slugEdited, setSlugEdited] = useState(entry !== null)
  const [confirmingSlug, setConfirmingSlug] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const slugId = useId()
  const name = draft.name.trim()
  const withSlug = kind === 'community'
  // Proposé depuis le nom tant qu'on ne l'a pas corrigé à la main : #166 demande les deux.
  const slug = withSlug ? (slugEdited ? (draft.slug ?? '') : slugify(name)) : undefined
  const slugChanged = entry !== null && withSlug && slug !== entry.slug
  const tooLong = (draft.description ?? '').length > DESCRIPTION_LIMIT

  async function submit(event: FormEvent | null, confirmed = false): Promise<void> {
    event?.preventDefault()
    setFormError(null)

    if (!name) {
      setNameError('Le nom est obligatoire.')
      document.getElementById(nameId)?.focus()
      return
    }
    if (tooLong) return

    if (withSlug && slug !== undefined && slug !== '' && !isValidSlug(slug)) {
      setSlugError(
        'Le slug ne peut contenir que des minuscules non accentuées, des chiffres et des tirets.',
      )
      document.getElementById(slugId)?.focus()
      return
    }

    // Une adresse déjà partagée cessera de fonctionner : #166 demande que l'écran le dise avant
    // de l'accepter, et non après.
    if (slugChanged && !confirmed) {
      setConfirmingSlug(true)
      return
    }

    setSaving(true)
    try {
      await onSubmit({ ...draft, name, ...(withSlug ? { slug: slug || undefined } : {}) })
      onClose()
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'COMMUNITY_SLUG_TAKEN') {
        const holder = cause.body?.['holder']
        setSlugError(
          typeof holder === 'string'
            ? `« ${holder} » utilise déjà ce slug.`
            : 'Une autre communauté utilise déjà ce slug.',
        )
        document.getElementById(slugId)?.focus()
      } else if (cause instanceof ApiError && cause.code?.endsWith('_NAME_TAKEN')) {
        setNameError(copy.taken)
        document.getElementById(nameId)?.focus()
      } else {
        setFormError('L’enregistrement a échoué. Réessayez.')
      }
    } finally {
      setSaving(false)
      setConfirmingSlug(false)
    }
  }

  const preview =
    kind === 'community' ? (
      <CommunityAvatar
        community={{ id: entry?.id ?? '', name: name || '?', logoUrl: draft.logoUrl }}
        size={56}
        seed={entry?.id ?? name}
        hidden
        className="rounded-[12px]"
      />
    ) : (
      <TechnologyAvatar
        technology={{ id: entry?.id ?? '', name: name || '?', logoUrl: draft.logoUrl }}
        size={56}
        hidden
        className="rounded-[12px]"
      />
    )

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      restoreFocusTo={restoreFocusTo}
      title={entry ? copy.edit : copy.create}
      subtitle={entry ? entry.name : copy.createSubtitle}
      footer={
        <>
          {destructiveAction}
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button type="submit" form="reference-form" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      {/* `noValidate` : le champ garde `required` pour ce qu'il annonce aux technologies
          d'assistance, mais c'est cette page qui refuse et qui parle. La validation native
          afficherait une bulle dans la langue du navigateur, à un endroit qu'on ne contrôle pas,
          et empêcherait le message français demandé par la story d'apparaître du tout. */}
      <form
        id="reference-form"
        noValidate
        onSubmit={(event) => void submit(event)}
        className="space-y-6"
      >
        {formError ? <Alert tone="error">{formError}</Alert> : null}

        <LogoField
          destination={copy.destination}
          preview={preview}
          hasLogo={draft.logoPath !== null}
          onUploaded={(image) => {
            setDraft((current) => ({ ...current, logoPath: image.path, logoUrl: image.url }))
          }}
          onCleared={() => {
            setDraft((current) => ({ ...current, logoPath: null, logoUrl: null }))
          }}
        />

        <Field label="Nom *" htmlFor={nameId} error={nameError}>
          <input
            id={nameId}
            value={draft.name}
            maxLength={200}
            placeholder={copy.namePlaceholder}
            required
            aria-invalid={nameError !== null}
            // Rattacher le message au contrôle est le travail de l'appelant, `Field` le dit.
            aria-describedby={nameError ? errorId(nameId) : undefined}
            className={INPUT_BASE}
            onChange={(event) => {
              setNameError(null)
              setDraft((current) => ({ ...current, name: event.target.value }))
            }}
          />
        </Field>

        {withSlug ? (
          <Field
            label="Adresse (slug)"
            htmlFor={slugId}
            hint="L’adresse du backoffice : /c/azure-user-group-france/evenements"
            error={slugError}
          >
            <input
              id={slugId}
              value={slug ?? ''}
              maxLength={SLUG_MAX_LENGTH}
              placeholder="azure-user-group-france"
              aria-invalid={slugError !== null}
              aria-describedby={slugError ? errorId(slugId) : hintId(slugId)}
              className={INPUT_BASE}
              onChange={(event) => {
                setSlugError(null)
                // Dès la première frappe, il cesse de suivre le nom : une correction manuelle
                // ne doit pas être écrasée au caractère suivant.
                setSlugEdited(true)
                setDraft((current) => ({ ...current, slug: event.target.value }))
              }}
            />
          </Field>
        ) : null}

        {kind === 'community' ? (
          <Field
            label="Description"
            htmlFor={descriptionId}
            hint={`Affichée sur le carrousel du site public. ${String(DESCRIPTION_LIMIT)} caractères au maximum.`}
            error={tooLong ? `La description dépasse ${String(DESCRIPTION_LIMIT)} caractères.` : null}
          >
            <textarea
              id={descriptionId}
              rows={3}
              value={draft.description ?? ''}
              aria-invalid={tooLong}
              aria-describedby={tooLong ? errorId(descriptionId) : hintId(descriptionId)}
              className={cn(INPUT_BASE, 'resize-y')}
              onChange={(event) => {
                // La chaîne vide devient `null` : c'est « pas de description », et c'est ce que
                // la colonne porte. Deux façons de dire la même absence n'en font qu'une ici.
                const next = event.target.value
                setDraft((current) => ({ ...current, description: next === '' ? null : next }))
              }}
            />
          </Field>
        ) : null}

        <StatusField
          value={draft.status}
          onChange={(status) => {
            setDraft((current) => ({ ...current, status }))
          }}
        />
      </form>

      <ConfirmDialog
        open={confirmingSlug}
        onOpenChange={setConfirmingSlug}
        title="Changer l’adresse de cette communauté ?"
        confirmLabel="Changer l’adresse"
        pending={saving}
        onConfirm={() => void submit(null, true)}
        description={
          <>
            Les adresses déjà partagées vers{' '}
            <strong className="text-ink">{entry?.name}</strong> cesseront de fonctionner. La
            nouvelle sera <strong className="text-ink">/c/{slug}</strong>.
          </>
        }
      />
    </SidePanel>
  )
}

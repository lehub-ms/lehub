import { useId, useRef, useState, type ReactNode } from 'react'
import { ImageOff } from 'lucide-react'
import { ApiError, uploadImage, type UploadedImage } from '@/lib/api'

interface BannerFieldProps {
  /** L'URL absolue de l'image courante, ou `null`. Le chemin, lui, vit dans le brouillon. */
  previewUrl: string | null
  /** L'évènement auquel elle se rattache, absent en création. Décide de l'habilitation côté API. */
  eventId?: string | undefined
  onUploaded: (image: UploadedImage) => void
  onCleared: () => void
}

/**
 * Le dépôt de la bannière : un aperçu au ratio 16/9, un bouton d'import, un bouton de retrait.
 *
 * Frère de `LogoField` plutôt qu'une généralisation de celui-ci : les deux partagent le geste et
 * rien d'autre. Un logo est souvent vectoriel, une bannière est une photographie de 1600 × 900 —
 * les formats acceptés diffèrent, l'aperçu diffère, et le serveur les arbitre différemment.
 * Fusionner les deux reviendrait à un composant paramétré par tout ce qui les distingue.
 *
 * Le fichier part **immédiatement** vers `POST /api/media/uploads` et le brouillon ne retient que
 * le chemin renvoyé. C'est ce qui crée les blobs orphelins quand le formulaire est quitté sans
 * enregistrer : assumé et documenté côté serveur (`api/src/functions/mediaUpload.ts`), parce que
 * l'alternative serait de renoncer à l'aperçu réel. L'edge case de #148 — « téléversement
 * interrompu » — tombe de là : l'évènement conserve son image précédente tant que rien n'a été
 * enregistré, et aucun chemin orphelin ne lui est attribué.
 *
 * Le contrôle de type et de taille ici est un confort, jamais une protection : le serveur
 * revérifie les octets et c'est lui qui décide (#148).
 */
const MAX_BYTES = 2 * 1024 * 1024
const ACCEPTED = 'image/png,image/jpeg,image/webp'

export function BannerField({
  previewUrl,
  eventId,
  onUploaded,
  onCleared,
}: BannerFieldProps): ReactNode {
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(file: File): Promise<void> {
    setError(null)

    if (file.size > MAX_BYTES) {
      setError('L’image dépasse 2 Mo. Choisissez un fichier plus léger.')
      return
    }

    setPending(true)
    try {
      onUploaded(await uploadImage(file, 'event-banner', eventId))
    } catch (cause) {
      setError(messageFor(cause))
    } finally {
      setPending(false)
      // Vidé pour que redéposer le même fichier après une erreur déclenche bien un `change`.
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div>
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-dashed border-primary/12 bg-surface-subtle">
        {previewUrl ? (
          // Alternative vide : la bannière est décorative, le titre de l'évènement porte
          // l'information (#148). Une alternative la ferait lire deux fois.
          <img src={previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-center text-[0.8125rem] text-ink-muted">
            <ImageOff aria-hidden="true" className="size-6" />
            <strong className="font-heading text-sm text-ink">Aucune image</strong>
            <span>1600 × 900 px · JPG, PNG ou WebP · 2 Mo maximum</span>
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {/* Un `<label>` plutôt qu'un bouton qui cliquerait l'input : c'est le mécanisme natif,
            atteignable au clavier et annoncé correctement. */}
        <label
          htmlFor={inputId}
          className="cursor-pointer text-[0.8125rem] font-semibold text-primary underline-offset-2 hover:underline"
        >
          {pending ? 'Import en cours…' : previewUrl ? 'Remplacer' : 'Importer une image'}
        </label>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          disabled={pending}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void send(file)
          }}
        />
        {previewUrl ? (
          <button
            type="button"
            onClick={() => {
              setError(null)
              onCleared()
            }}
            className="text-[0.8125rem] font-semibold text-[#b91c1c] underline-offset-2 hover:underline"
          >
            Retirer
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-[#b91c1c]">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Les refus du serveur, dits en français — le contrat n'en porte que le code. */
function messageFor(cause: unknown): string {
  if (!(cause instanceof ApiError)) return 'Le téléversement a échoué. Réessayez.'

  switch (cause.code) {
    case 'UNSUPPORTED_MEDIA_TYPE':
      return 'Une bannière doit être une image JPG, PNG ou WebP.'
    case 'FILE_TOO_LARGE':
      return 'L’image dépasse 2 Mo. Choisissez un fichier plus léger.'
    case 'NO_FILE':
      return 'Le fichier est vide.'
    case 'FORBIDDEN':
      return 'Vous n’êtes pas autorisé à déposer une image sur cet évènement.'
    default:
      return 'Le téléversement a échoué. Réessayez.'
  }
}

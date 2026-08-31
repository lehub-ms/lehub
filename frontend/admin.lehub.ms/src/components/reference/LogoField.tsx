import { useId, useRef, useState, type ReactNode } from 'react'
import { ApiError, uploadImage, type UploadDestination, type UploadedImage } from '@/lib/api'

interface LogoFieldProps {
  destination: UploadDestination
  /** L'aperçu, rendu par l'appelant : c'est le même composant que le site public affiche. */
  preview: ReactNode
  hasLogo: boolean
  onUploaded: (image: UploadedImage) => void
  onCleared: () => void
}

/**
 * Le dépôt d'un logo : un aperçu, un bouton d'import, un bouton de retrait.
 *
 * Le fichier part immédiatement vers `POST /api/media/uploads` et l'entité ne retient que le
 * chemin renvoyé. C'est aussi ce qui crée les blobs orphelins quand le panneau est refermé sans
 * enregistrer — assumé et documenté côté serveur, parce que l'alternative serait de renoncer à
 * l'aperçu réel.
 *
 * Le contrôle de type et de taille ici est un confort, jamais une protection : le serveur
 * revérifie les octets, et c'est lui qui décide. Il évite simplement un aller-retour pour un
 * fichier manifestement hors sujet.
 */
const MAX_BYTES = 2 * 1024 * 1024
const ACCEPTED = 'image/png,image/jpeg,image/svg+xml,image/webp'

export function LogoField({
  destination,
  preview,
  hasLogo,
  onUploaded,
  onCleared,
}: LogoFieldProps): ReactNode {
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
      onUploaded(await uploadImage(file, destination))
    } catch (cause) {
      setError(messageFor(cause))
    } finally {
      setPending(false)
      // Vidé pour que redéposer le même fichier après une erreur déclenche bien un `change`.
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-4">
      {preview}

      <div className="min-w-0">
        <p className="font-heading text-[0.8125rem] font-semibold text-ink">Logo</p>
        <p className="text-[0.8125rem] text-ink-muted">
          {hasLogo ? 'Image importée' : 'Aucun fichier — les initiales sont utilisées'}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          {/* Un `<label>` plutôt qu'un bouton qui cliquerait l'input : c'est le mécanisme natif,
              il est atteignable au clavier et annoncé correctement. */}
          <label
            htmlFor={inputId}
            className="cursor-pointer text-[0.8125rem] font-semibold text-primary underline-offset-2 hover:underline"
          >
            {pending ? 'Import en cours…' : hasLogo ? 'Remplacer' : 'Importer une image'}
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
          {hasLogo ? (
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
          <p role="alert" className="mt-1.5 text-[0.8125rem] text-[#b91c1c]">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** Les refus du serveur, dits en français — le contrat n'en porte que le code. */
function messageFor(cause: unknown): string {
  if (!(cause instanceof ApiError)) return 'Le téléversement a échoué. Réessayez.'

  switch (cause.code) {
    case 'UNSUPPORTED_MEDIA_TYPE':
      return 'Ce fichier n’est pas une image PNG, JPEG, WebP ou SVG.'
    case 'FILE_TOO_LARGE':
      return 'L’image dépasse 2 Mo. Choisissez un fichier plus léger.'
    case 'NO_FILE':
      return 'Le fichier est vide.'
    case 'FORBIDDEN':
      return 'Vous n’êtes pas autorisé à déposer une image ici.'
    default:
      return 'Le téléversement a échoué. Réessayez.'
  }
}

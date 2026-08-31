import { HttpRequest, InvocationContext } from '@azure/functions'
import { beforeEach, describe, expect, it } from 'vitest'
import { uploadImage, type BlobWriter } from '../src/functions/mediaUpload'
import { MAX_UPLOAD_BYTES } from '../src/lib/uploadSchemas'
import { type SessionPermissions } from '../src/lib/permissionsRepo'
import { type AuthenticatedIdentity } from '../src/lib/tokenValidation'
import { type AuthenticatedSession } from '../src/lib/withAuthorization'

const IDENTITY: AuthenticatedIdentity = {
  objectId: 'c722f670-cebf-4f94-b3b2-1723bfa372e6',
  email: 'admin@example.com',
  givenName: 'Amélie',
  familyName: 'Rousseau',
}

const ADMIN: SessionPermissions = { isGlobalAdmin: true, organizedCommunityIds: [] }
const ORGANIZER: SessionPermissions = {
  isGlobalAdmin: false,
  organizedCommunityIds: ['C1C1C1C1-0000-0000-0000-000000000001'],
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0])
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>')

function session(permissions: SessionPermissions): AuthenticatedSession {
  return { identity: IDENTITY, permissions }
}

/** Capture les appels à context.error sans dépendre du hôte Functions. */
function context(): InvocationContext & { errors: unknown[][] } {
  const errors: unknown[][] = []
  const ctx = new InvocationContext({ functionName: 'test' }) as InvocationContext & {
    errors: unknown[][]
  }
  ctx.error = (...args: unknown[]) => void errors.push(args)
  ctx.errors = errors
  return ctx
}

/** Un vrai corps multipart, encodé comme un navigateur l'enverrait. */
async function upload(parts: {
  bytes?: Uint8Array
  filename?: string
  declaredType?: string
  destination?: string
}): Promise<HttpRequest> {
  const form = new FormData()
  if (parts.destination !== undefined) form.set('destination', parts.destination)
  if (parts.bytes) {
    form.set(
      'file',
      new File([parts.bytes], parts.filename ?? 'logo.bin', {
        type: parts.declaredType ?? 'application/octet-stream',
      }),
    )
  }

  const encoded = new Response(form)
  const body = new Uint8Array(await encoded.arrayBuffer())

  return new HttpRequest({
    method: 'POST',
    url: 'https://api.example.com/api/media/uploads',
    body: { bytes: body },
    headers: { 'content-type': encoded.headers.get('content-type') ?? '' },
  })
}

interface Written {
  blobName: string
  bytes: Uint8Array
  headers: { blobContentType: string; blobContentDisposition?: string }
}

let written: Written[]
const writer: BlobWriter = (blobName, bytes, headers) => {
  written.push({ blobName, bytes, headers })
  return Promise.resolve()
}

beforeEach(() => {
  written = []
  process.env['MEDIA_BASE_URL'] = 'https://media.example/media'
})

describe('téléversement d’une image', () => {
  it('range le logo sous le préfixe de sa destination et rend le chemin à enregistrer', async () => {
    const response = await uploadImage(writer)(
      await upload({ bytes: PNG, destination: 'community-logo' }),
      context(),
      session(ADMIN),
    )

    expect(response.status).toBe(201)
    const { path, url } = response.jsonBody as { path: string; url: string }
    expect(path).toMatch(/^communities\/[0-9a-f-]{36}\.png$/)
    expect(url).toBe(`https://media.example/media/${path}`)
    expect(written[0]?.blobName).toBe(path)
  })

  it('range une icône de technologie sous son propre préfixe', async () => {
    const response = await uploadImage(writer)(
      await upload({ bytes: SVG, destination: 'technology-logo' }),
      context(),
      session(ADMIN),
    )

    expect((response.jsonBody as { path: string }).path).toMatch(
      /^technologies\/[0-9a-f-]{36}\.svg$/,
    )
  })

  it('ne reprend jamais le nom du fichier reçu', async () => {
    const response = await uploadImage(writer)(
      await upload({ bytes: PNG, filename: '../../secret.png', destination: 'community-logo' }),
      context(),
      session(ADMIN),
    )

    const { path } = response.jsonBody as { path: string }
    expect(path).not.toContain('secret')
    expect(path).not.toContain('..')
  })

  it('décide du type par le contenu, pas par l’extension annoncée', async () => {
    // Un PNG déclaré en JPEG et nommé .jpg : l'extension du blob suit les octets.
    const response = await uploadImage(writer)(
      await upload({
        bytes: PNG,
        filename: 'logo.jpg',
        declaredType: 'image/jpeg',
        destination: 'community-logo',
      }),
      context(),
      session(ADMIN),
    )

    expect((response.jsonBody as { path: string }).path).toMatch(/\.png$/)
    expect(written[0]?.headers.blobContentType).toBe('image/png')
  })

  it('sert un SVG en pièce jointe, pour qu’une navigation directe ne l’exécute pas', async () => {
    await uploadImage(writer)(
      await upload({ bytes: SVG, destination: 'technology-logo' }),
      context(),
      session(ADMIN),
    )

    // Ignoré par `<img>`, donc l'aperçu s'affiche toujours ; honoré à la navigation, ce qui
    // ferme la dernière porte du SVG sur une origine sans CSP.
    expect(written[0]?.headers.blobContentDisposition).toBe('attachment')
  })

  it('ne pose pas cet en-tête sur un format qui ne porte pas de balisage', async () => {
    await uploadImage(writer)(
      await upload({ bytes: PNG, destination: 'community-logo' }),
      context(),
      session(ADMIN),
    )

    expect(written[0]?.headers.blobContentDisposition).toBeUndefined()
  })
})

describe('refus', () => {
  it('refuse un appelant non habilité en 403 journalisé, sans écrire', async () => {
    const ctx = context()
    const response = await uploadImage(writer)(
      await upload({ bytes: PNG, destination: 'community-logo' }),
      ctx,
      session(ORGANIZER),
    )

    expect(response.status).toBe(403)
    expect(written).toHaveLength(0)

    const logged = JSON.stringify(ctx.errors)
    expect(logged).toContain('upload:community-logo')
    expect(logged).toContain(IDENTITY.objectId)
    // L'identifiant suffit à retrouver l'appelant ; le journal ne décrit rien de plus.
    expect(logged).not.toContain(IDENTITY.email)
  })

  it('refuse un type non autorisé en 415, décidé sur les octets', async () => {
    const response = await uploadImage(writer)(
      await upload({ bytes: GIF, filename: 'x.png', destination: 'community-logo' }),
      context(),
      session(ADMIN),
    )

    expect(response.status).toBe(415)
    expect(written).toHaveLength(0)
  })

  it('refuse un fichier trop gros en 413, sans jamais appeler l’écriture', async () => {
    const tooBig = new Uint8Array(MAX_UPLOAD_BYTES + 1)
    tooBig.set(PNG)

    const response = await uploadImage(writer)(
      await upload({ bytes: tooBig, destination: 'community-logo' }),
      context(),
      session(ADMIN),
    )

    expect(response.status).toBe(413)
    expect(written).toHaveLength(0)
  })

  it('refuse une requête sans fichier, explicitement et non en erreur serveur', async () => {
    const response = await uploadImage(writer)(
      await upload({ destination: 'community-logo' }),
      context(),
      session(ADMIN),
    )

    expect(response.status).toBe(400)
    expect((response.jsonBody as { code: string }).code).toBe('NO_FILE')
  })

  it('refuse un fichier vide de la même façon', async () => {
    const response = await uploadImage(writer)(
      await upload({ bytes: new Uint8Array(0), destination: 'community-logo' }),
      context(),
      session(ADMIN),
    )

    expect(response.status).toBe(400)
  })

  it('refuse une destination inconnue avant de regarder le fichier', async () => {
    const response = await uploadImage(writer)(
      await upload({ bytes: PNG, destination: 'wherever' }),
      context(),
      session(ADMIN),
    )

    expect(response.status).toBe(400)
    expect((response.jsonBody as { code: string }).code).toBe('INVALID_DESTINATION')
  })

  it('refuse une destination absente', async () => {
    const response = await uploadImage(writer)(
      await upload({ bytes: PNG }),
      context(),
      session(ADMIN),
    )

    expect(response.status).toBe(400)
  })

  it('rend une 500 stable quand le stockage refuse l’écriture', async () => {
    const failing: BlobWriter = () => Promise.reject(new Error('conteneur indisponible'))
    const ctx = context()

    const response = await uploadImage(failing)(
      await upload({ bytes: PNG, destination: 'community-logo' }),
      ctx,
      session(ADMIN),
    )

    expect(response.status).toBe(500)
    // Le détail part dans la trace, pas dans la réponse.
    expect(JSON.stringify(response.jsonBody)).not.toContain('conteneur indisponible')
    // L'erreur voyage en argument propre : imbriquée dans un objet, elle se sérialiserait en
    // « {} » et la trace ne dirait plus rien.
    expect(ctx.errors[0]?.[2]).toBeInstanceOf(Error)
    expect((ctx.errors[0]?.[2] as Error).message).toBe('conteneur indisponible')
  })
})

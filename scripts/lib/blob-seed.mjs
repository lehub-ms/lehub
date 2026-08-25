// Create the local media container and upload the demonstration media.
//
// Run through scripts/blob-seed.sh, which owns the argument parsing, the toolchain
// checks and the MEDIA_CONTAINER value. The Node here exists for one reason: the
// Azure Storage SDK is the only client that understands the emulator's conventional
// `UseDevelopmentStorage=true` shortcut. Every other tool — the Azure CLI included —
// wants the account key spelled out, which would put a storage key in a versioned
// file. The SDK is consumed from api/node_modules, as dev-start.sh does for
// concurrently; there is no root package.json, on purpose.

import { createRequire } from 'node:module'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve, sep, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const LIB_DIR = fileURLToPath(new URL('.', import.meta.url))
const ROOT_DIR = resolve(LIB_DIR, '..', '..')
const MEDIA_DIR = join(ROOT_DIR, 'db', 'seed', 'media')

const require = createRequire(pathToFileURL(join(ROOT_DIR, 'api', 'package.json')))
const { BlobServiceClient } = require('@azure/storage-blob')

// Explicit, not guessed: an unknown extension is a mistake in db/seed/media, and a
// blob served as application/octet-stream renders nowhere.
const CONTENT_TYPES = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

// What the media account will serve in the cloud: media are immutable, a new visual
// is a new blob name. Set here too so the local loop shows the production headers.
const CACHE_CONTROL = 'public, max-age=31536000, immutable'

const container = process.env['MEDIA_CONTAINER']
if (!container) {
  fail('MEDIA_CONTAINER is not set. Run this through ./scripts/blob-seed.sh.')
}

const withDemo = process.argv.slice(2).includes('--demo')

/** Everything under db/seed/media, as paths relative to it — the blob names. */
async function mediaFiles(dir = MEDIA_DIR) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await mediaFiles(full)))
    } else if (entry.name !== 'README.md') {
      // Blob names use forward slashes on every platform.
      files.push(relative(MEDIA_DIR, full).split(sep).join('/'))
    }
  }

  return files.sort()
}

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

const client = BlobServiceClient.fromConnectionString('UseDevelopmentStorage=true')
const containerClient = client.getContainerClient(container)

try {
  const created = await containerClient.createIfNotExists({ access: 'blob' })
  // Applied even when the container already existed: an emulator volume created by
  // hand, or by an older revision of this script, may hold a private container, and
  // a private container fails as a 404 in the browser with no other symptom.
  await containerClient.setAccessPolicy('blob')
  process.stdout.write(
    `  container ${container}: ${created.succeeded ? 'created' : 'already present'}, anonymous blob read\n`,
  )
} catch (error) {
  // The SDK wraps a refused socket in a RestError but keeps the original code, so
  // this stays narrow: any other failure is a real one and must surface as it is.
  if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
    fail(`  Azurite is not reachable on ${client.url}.
  Inspect it with: docker compose logs azurite
  Start it with:   ./scripts/dev-up.sh`)
  }
  throw error
}

if (!withDemo) {
  process.exit(0)
}

const files = await mediaFiles()
if (files.length === 0) {
  fail(`  No media found under ${relative(ROOT_DIR, MEDIA_DIR)}.`)
}

for (const name of files) {
  const contentType = CONTENT_TYPES[extname(name).toLowerCase()]
  if (!contentType) {
    fail(`  Unknown media type for ${name}. Add its extension to CONTENT_TYPES.`)
  }

  const body = await readFile(join(MEDIA_DIR, ...name.split('/')))
  // upload() overwrites, so replaying neither fails nor duplicates.
  await containerClient.getBlockBlobClient(name).upload(body, body.byteLength, {
    blobHTTPHeaders: { blobContentType: contentType, blobCacheControl: CACHE_CONTROL },
  })
}

process.stdout.write(`  ${files.length} demonstration media uploaded\n`)

// Create the local media container and upload the media it is given.
//
// Run through scripts/blob-seed.sh, which owns the argument parsing, the toolchain
// checks, which files belong to which tier and what Content-Type each carries. The Node
// here exists for one reason: the Azure Storage SDK is the only client that understands
// the emulator's conventional `UseDevelopmentStorage=true` shortcut. Every other tool —
// the Azure CLI included — wants the account key spelled out, which would put a storage
// key in a versioned file. Against a real account the CLI does the job and blob-seed.sh
// calls it directly, so nothing here knows about the cloud.
//
// The SDK is consumed from api/node_modules, as dev-start.sh does for concurrently;
// there is no root package.json, on purpose.
//
// Usage: node blob-seed.mjs <blob-name>=<content-type> ...

import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const LIB_DIR = fileURLToPath(new URL('.', import.meta.url))
const ROOT_DIR = resolve(LIB_DIR, '..', '..')
const MEDIA_DIR = join(ROOT_DIR, 'db', 'seed', 'media')

const require = createRequire(pathToFileURL(join(ROOT_DIR, 'api', 'package.json')))
const { BlobServiceClient } = require('@azure/storage-blob')

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function fromEnv(name) {
  const value = process.env[name]
  if (!value) fail(`${name} is not set. Run this through ./scripts/blob-seed.sh.`)
  return value
}

const container = fromEnv('MEDIA_CONTAINER')
const cacheControl = fromEnv('MEDIA_CACHE_CONTROL')

const uploads = process.argv.slice(2).map((pair) => {
  const separator = pair.indexOf('=')
  if (separator < 1) fail(`Malformed upload '${pair}'. Expected <blob-name>=<content-type>.`)
  return { name: pair.slice(0, separator), contentType: pair.slice(separator + 1) }
})

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

for (const { name, contentType } of uploads) {
  const body = await readFile(join(MEDIA_DIR, ...name.split('/')))
  // upload() overwrites, so replaying neither fails nor duplicates.
  await containerClient.getBlockBlobClient(name).upload(body, body.byteLength, {
    blobHTTPHeaders: { blobContentType: contentType, blobCacheControl: cacheControl },
  })
  process.stdout.write(`  ${name}\n`)
}

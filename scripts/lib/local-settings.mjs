#!/usr/bin/env node
// Render the managed keys of api/local.settings.json without touching anything else.
//
// The file holds the local SQL password and whatever a contributor added by hand, so it is
// never regenerated wholesale. Only the keys this repository derives from the workspace are
// rewritten, on every dev-up.sh and dev-start.sh:
//
//   Values.SQL_DATABASE   the workspace's own database on the shared SQL instance
//   Values.SQL_PASSWORD   the shared instance password, from the Git common directory
//   Values.MEDIA_BASE_URL absolute base of the media container, on the host in use
//   Values.MEDIA_STORAGE_AUTH_MODE  always "emulator" locally: Azurite accepts no Entra token
//   Values.ENTRA_*        the dev identity tenant the local loop borrows
//   Host.CORS             the front-end origins of this workspace's slot
//
// Rewriting rather than "leaving untouched" is the point: a workspace bootstrapped before
// this state existed, or one whose slot was reassigned, would otherwise keep pointing at
// another workspace's database with another workspace's password.
//
//   node local-settings.mjs <settings.json> <settings.json.example>
//
// Managed values arrive through the environment — LEHUB_DB_NAME, MSSQL_SA_PASSWORD,
// LEHUB_MEDIA_BASE_URL, LEHUB_CORS_ORIGINS — never through argv, where a password would
// show up in `ps`.

import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs'

const [settingsPath, examplePath] = process.argv.slice(2)
if (!settingsPath || !examplePath) {
  process.stderr.write('usage: local-settings.mjs <settings.json> <settings.json.example>\n')
  process.exit(2)
}

const required = (name) => {
  const value = process.env[name]
  if (!value) {
    process.stderr.write(`${name} must be set in the environment\n`)
    process.exit(2)
  }
  return value
}

const read = (path) => JSON.parse(readFileSync(path, 'utf8'))

const example = read(examplePath)
const created = !existsSync(settingsPath)
const settings = created ? example : read(settingsPath)

settings.Values ??= {}
settings.Host ??= {}

const managedValues = {
  SQL_DATABASE: required('LEHUB_DB_NAME'),
  SQL_PASSWORD: required('MSSQL_SA_PASSWORD'),
  // Follows the host the applications are served on: an image served from the loopback is
  // unreachable from a phone, so the page would render with every visual missing.
  MEDIA_BASE_URL: required('LEHUB_MEDIA_BASE_URL'),
  // Constant rather than derived, and managed rather than left to the template: a workspace
  // bootstrapped before the upload route existed would otherwise never receive the key, and the
  // symptom would be a 500 on an upload with a healthy-looking configuration everywhere else.
  MEDIA_STORAGE_AUTH_MODE: 'emulator',
  // The dev tenant, borrowed locally. Managed like the rest so a workspace can never keep a
  // client ID the registration no longer serves. None of them is a credential — the API
  // validates tokens against them, it never presents them.
  ENTRA_TENANT_ID: required('LEHUB_ENTRA_TENANT_ID'),
  ENTRA_CLIENT_ID: required('LEHUB_ENTRA_CLIENT_ID'),
  ENTRA_AUTHORITY: required('LEHUB_ENTRA_AUTHORITY'),
  ENTRA_ISSUER: required('LEHUB_ENTRA_ISSUER'),
}

const changed = []
for (const [key, value] of Object.entries(managedValues)) {
  if (settings.Values[key] !== value) {
    settings.Values[key] = value
    changed.push(key)
  }
}

// The allow-list follows the slot, and is never widened beyond it: an origin the API does
// not list is refused, which is exactly what the two Static Web Apps get in production.
const cors = required('LEHUB_CORS_ORIGINS')
if (settings.Host.CORS !== cors) {
  settings.Host.CORS = cors
  changed.push('Host.CORS')
}

// A key added to the template after this workspace was bootstrapped would otherwise never
// arrive. The API refuses to serve a request on an incomplete configuration, so the symptom
// would be a 500 on /api/events with a healthy-looking stack.
const missing = Object.keys(example.Values ?? {}).filter((key) => !(key in settings.Values))
if (missing.length > 0) {
  process.stderr.write(`missing key(s) in ${settingsPath}: ${missing.join(' ')}\n`)
}

// mode on the write and a chmod after it: the first keeps a newly created file from ever
// existing world-readable, the second fixes a file that predates this rule. It carries the
// local SQL password, so it is readable by its owner only — as .env is.
if (created || changed.length > 0) {
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 })
}
chmodSync(settingsPath, 0o600)

process.stdout.write(created ? 'created' : changed.join(' '))

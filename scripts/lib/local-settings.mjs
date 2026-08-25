#!/usr/bin/env node
// Render the managed keys of api/local.settings.json without touching anything else.
//
// The file holds the local SQL password and whatever a contributor added by hand, so it is
// never regenerated wholesale. Only the keys this repository derives from the workspace are
// rewritten, on every dev-up.sh and dev-start.sh:
//
//   Values.SQL_DATABASE   the workspace's own database on the shared SQL instance
//   Values.SQL_PASSWORD   the shared instance password, from the Git common directory
//
// Rewriting rather than "leaving untouched" is the point: a workspace bootstrapped before
// this state existed, or one whose slot was reassigned, would otherwise keep pointing at
// another workspace's database with another workspace's password.
//
//   node local-settings.mjs <settings.json> <settings.json.example>
//
// Managed values arrive through the environment — LEHUB_DB_NAME, MSSQL_SA_PASSWORD — never
// through argv, where a password would show up in `ps`.

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

const managed = {
  SQL_DATABASE: required('LEHUB_DB_NAME'),
  SQL_PASSWORD: required('MSSQL_SA_PASSWORD'),
}

const changed = []
for (const [key, value] of Object.entries(managed)) {
  if (settings.Values[key] !== value) {
    settings.Values[key] = value
    changed.push(key)
  }
}

// A key added to the template after this workspace was bootstrapped would otherwise never
// arrive. The API refuses to serve a request on an incomplete configuration, so the symptom
// would be a 500 on /api/events with a healthy-looking stack.
const missing = Object.keys(example.Values ?? {}).filter((key) => !(key in settings.Values))
if (missing.length > 0) {
  process.stderr.write(`missing key(s) in ${settingsPath}: ${missing.join(' ')}\n`)
}

if (created || changed.length > 0) {
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
}
// It carries the local SQL password, so it is readable by its owner only — as .env is.
chmodSync(settingsPath, 0o600)

process.stdout.write(created ? 'created' : changed.join(' '))

# Seed media

The bytes the seed files point at, uploaded by `./scripts/blob-seed.sh` — to the local Azurite
emulator, or to the environment's media storage account. They exist so a logo or a banner shows
instead of only the colour fallbacks, on the same code path the browser takes in Azure.

Two tiers live here, under different terms and with different destinations. **The top-level
folder is what decides which**, and `api/test/seedMedia.test.ts` enforces it: a placeholder
named in `reference.sql`, or an icon named in `demo.sql`, fails the build rather than sending
bytes where they must never go.

## `communities/` and `events/` — placeholders, demonstration tier

Neutral marks created for this project. **No real community's logo, no real brand mark, no
wordmark.** This repository is public and MIT-licensed: a community's logo is theirs, and it is
uploaded through the backoffice by that community, never committed here. A file named after a
community carries a placeholder, not their identity.

Referenced by `db/seed/demo.sql` and uploaded by `./scripts/blob-seed.sh local --demo` only.
They never reach an Azure environment, at the same terms as the fictitious rows that reference
them — which is why `blob-seed.sh` refuses `--demo` for anything but `local`, one notch
stricter than `db-seed.sh`.

## `technologies/` — Microsoft product icons, reference tier

Official Microsoft product icons, imported from the Claude Design project `lehub.ms/icons/`,
which CLAUDE.md makes the source of truth for anything visual. They identify the technology an
event is about, which is the purpose they exist for, and the design project is where a new one
is added first.

Referenced by `db/seed/reference.sql` and deployed to every environment: `blob-seed.sh` uploads
them with no flag, and the deployment chain calls it next to the reference data. They are not
demonstration material — the technology reference is real business data.

**They are Microsoft trademarks and are not covered by this repository's MIT licence.** The
licence applies to the project's own code and assets; these marks remain the property of
Microsoft Corporation and are used here only to identify the products they designate, under
Microsoft's trademark and brand guidelines. Do not restyle, recolour or distort them, and do
not add one for a product whose icon the design project does not carry.

## Layout

The directory tree *is* the container tree. A file at `communities/devcom-lyon.svg` is uploaded
as the blob `communities/devcom-lyon.svg` inside the `media` container, and that is exactly the
string `db/seed/demo.sql` stores in `Community.LogoPath`. Adding a file therefore means adding
its path to the seed of its own tier — `api/test/seedMedia.test.ts` fails on either half of the
pair missing, and on a new top-level folder no tier claims.

```
communities/    square marks, 256×256 viewBox, transparent — the carousel renders them
                `object-contain` inside a white rounded box
events/         wide banners, 1200×480 viewBox — the event card renders them `cover`
technologies/   product icons, square, as published in the design project
```

The uploader maps the extension to a Content-Type, so a `.png` or a `.webp` dropped here works
with no code change. SVG is preferred where the source allows it: a kilobyte of text is
reviewable in a diff, and nothing binary needs to enter the repository for a placeholder.

Only part of the rows carry a media path, in either tier: the technologies the design project
publishes no icon for, and most of the demonstration entities. The rest stay `NULL` on purpose,
so the fallbacks — the gradient tile in the carousel, the deterministic gradient on an event
card, the neutral technology avatar — keep being exercised. They are what a public environment
mostly shows.

## Replacing or removing a file

Blobs are served `public, max-age=31536000, immutable`, here and in Azure: a browser that has
already fetched one will not ask again for up to a year. **A new visual is therefore a new blob
name**, never the same name with different bytes — the old name simply stops being referenced.
The seed follows: `reference.sql` fills a `LogoPath` only when it is `NULL`, so changing the
icon of a technology already deployed is a migration under `db/migrations/`, the mechanism this
repository already has for deliberately changing deployed data.

Removing a file here removes nothing from an environment. `blob-seed.sh` uploads, it never
deletes: an orphan blob stays served until someone removes it by hand, and the media account's
7-day retention covers the mistake if that hand was too quick.

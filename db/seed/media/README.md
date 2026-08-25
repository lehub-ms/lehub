# Demonstration media

Uploaded to the local Azurite emulator by `./scripts/blob-seed.sh local --demo`, and referenced
by `db/seed/demo.sql`. They exist so the local loop shows real logos and real banners instead of
only the colour fallbacks — the same code path the browser takes against the media storage
account in Azure.

Two kinds of file live here, under different terms.

## `communities/` and `events/` — placeholders

Neutral marks created for this project. **No real community's logo, no real brand mark, no
wordmark.** This repository is public and MIT-licensed: a community's logo is theirs, and it is
uploaded through the backoffice by that community, never committed here. A file named after a
community carries a placeholder, not their identity.

## `technologies/` — Microsoft product icons

Official Microsoft product icons, imported from the Claude Design project `lehub.ms/icons/`,
which CLAUDE.md makes the source of truth for anything visual. They identify the technology an
event is about, which is the purpose they exist for, and the design project is where a new one
is added first.

**They are Microsoft trademarks and are not covered by this repository's MIT licence.** The
licence applies to the project's own code and assets; these marks remain the property of
Microsoft Corporation and are used here only to identify the products they designate, under
Microsoft's trademark and brand guidelines. Do not restyle, recolour or distort them, and do
not add one for a product whose icon the design project does not carry.

## Layout

The directory tree *is* the container tree. A file at `communities/devcom-lyon.svg` is uploaded
as the blob `communities/devcom-lyon.svg` inside the `media` container, and that is exactly the
string `db/seed/demo.sql` stores in `Community.LogoPath`. Adding a file therefore means adding
its path to the seed — `api/test/demoMedia.test.ts` fails on either half of the pair missing.

```
communities/    square marks, 256×256 viewBox, transparent — the carousel renders them
                `object-contain` inside a white rounded box
events/         wide banners, 1200×480 viewBox — the event card renders them `cover`
technologies/   product icons, square, as published in the design project
```

The uploader maps the extension to a Content-Type, so a `.png` or a `.webp` dropped here works
with no code change. SVG is preferred where the source allows it: a kilobyte of text is
reviewable in a diff, and nothing binary needs to enter the repository for a placeholder.

Only part of the demonstration rows carry a media path. The rest stay `NULL` on purpose, so the
fallbacks — the gradient tile in the carousel, the deterministic gradient on an event card, the
neutral technology avatar — keep being exercised locally. They are what dev and prod actually
show.

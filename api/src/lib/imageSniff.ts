/**
 * What an uploaded file actually *is*, decided from its bytes.
 *
 * Story #154 is explicit: "vérifie le type réellement reçu et non l'extension annoncée". Both
 * the filename and the multipart `Content-Type` come from the caller, so neither decides
 * anything here — the extension the blob ends up with is derived from what this function found.
 */
export type ImageKind = 'png' | 'jpeg' | 'webp' | 'svg'

export interface SniffedImage {
  kind: ImageKind
  /** Including the dot, as it will be appended to the generated blob name. */
  extension: string
  contentType: string
}

const SIGNATURES: readonly {
  kind: Exclude<ImageKind, 'svg'>
  extension: string
  contentType: string
  matches: (bytes: Uint8Array) => boolean
}[] = [
  {
    kind: 'png',
    extension: '.png',
    contentType: 'image/png',
    matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    kind: 'jpeg',
    extension: '.jpg',
    contentType: 'image/jpeg',
    matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  },
  {
    kind: 'webp',
    extension: '.webp',
    contentType: 'image/webp',
    // RIFF container, then the four-byte form type at offset 8. Checking only `RIFF` would
    // accept a WAV file.
    matches: (b) =>
      startsWith(b, [0x52, 0x49, 0x46, 0x46]) &&
      b.length >= 12 &&
      startsWith(b.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  },
]

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((byte, index) => bytes[index] === byte)
}

/**
 * GIF is deliberately absent from the allow-list: nothing in the referential or in an event
 * banner needs one, and every format accepted is a decoder exposed.
 */

/**
 * SVG has no magic number, so it is decided by reading it — and it is the one format that can
 * carry script, so it is decided strictly.
 *
 * Refusing rather than sanitising. A rewriter has to be right about every parser quirk, for
 * ever; a refusal only has to be right about what a logo needs, and a logo needs none of what
 * is refused below. The administrator uploads a clean icon, which the official product icons
 * already are.
 */
const SVG_REFUSALS: readonly RegExp[] = [
  /<\s*script/i,
  /<\s*foreignobject/i,
  /<\s*iframe/i,
  /<\s*(!doctype|!entity)/i, // XXE and the billion-laughs expansion
  /\son\w+\s*=/i, // onload=, onerror=, …
  /javascript\s*:/i,
  /@import/i,
  // An external reference pulls bytes from somewhere we do not control every time the logo is
  // displayed. A same-document fragment (`#id`) and an inline data image are the two legitimate
  // uses, so they are the two allowed.
  /\b(?:xlink:)?href\s*=\s*["'](?!#|data:image\/)/i,
]

function looksLikeSvg(bytes: Uint8Array): boolean {
  // A NUL byte means this is binary that happens to start with printable characters, not text.
  if (bytes.includes(0)) return false

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return false
  }

  // Numeric entities are collapsed before scanning, so `&#x3c;script` cannot slip past a
  // literal `<script` test.
  const scanned = text.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
    String.fromCodePoint(Number.parseInt(hex, 16)),
  ).replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))

  if (SVG_REFUSALS.some((pattern) => pattern.test(scanned))) return false

  // The first element has to be the root `<svg`: a prolog and comments may precede it, nothing
  // else may.
  const withoutProlog = scanned
    .replace(/^﻿/, '')
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trimStart()

  return /^<\s*svg[\s>]/i.test(withoutProlog)
}

/** `null` when the bytes are not one of the accepted images — the caller answers 415. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length === 0) return null

  for (const signature of SIGNATURES) {
    if (signature.matches(bytes)) {
      return {
        kind: signature.kind,
        extension: signature.extension,
        contentType: signature.contentType,
      }
    }
  }

  if (looksLikeSvg(bytes)) {
    return { kind: 'svg', extension: '.svg', contentType: 'image/svg+xml' }
  }

  return null
}

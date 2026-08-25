/**
 * A minimal layout engine for `EntityRow`'s measurement branches.
 *
 * jsdom computes no layout at all — every `clientWidth`/`scrollWidth` is `0` — so a row
 * always sees "it fits" and stays in its full-pill mode. That is the right *default*
 * (every pre-existing test keeps reading names as text), but it leaves the logo-only and
 * "+N" branches unreachable. This makes them reachable by answering both widths from the
 * live DOM: available width is whatever the test declares, natural width is derived from
 * the `data-*` hooks the row and its items already emit.
 *
 * Approximate on purpose. The component only ever compares the two numbers, so what has
 * to be faithful is the *ordering* of layouts, not their pixel values.
 */
const CHAR_PX = 7
/** Avatar + gap + the pill's horizontal padding. */
const PILL_CHROME_PX = 46
const GAP_PX = 4
const AVATAR_PX = 20
const MORE_PX = 24
/** `min-w-11` on the logo row's trigger. */
const TRIGGER_MIN_PX = 44

let availableWidth = 0

/** The width every measured row believes it has. */
export function setAvailableWidth(px: number): void {
  availableWidth = px
}

function isRow(element: HTMLElement): boolean {
  return element.dataset['fitMode'] !== undefined
}

function naturalWidth(row: HTMLElement): number {
  if (row.dataset['fitMode'] === 'full') {
    return [...row.querySelectorAll<HTMLElement>('[data-pill]')].reduce(
      (total, pill, index) =>
        total + PILL_CHROME_PX + CHAR_PX * (pill.textContent?.length ?? 0) + (index === 0 ? 0 : GAP_PX),
      0,
    )
  }

  // Logos are laid side by side, so every one past the first costs a whole avatar plus the
  // gap — there is no overlap to discount.
  const avatars = row.querySelectorAll('[data-avatar]').length
  const more = row.querySelector('[data-more]') ? GAP_PX + MORE_PX : 0
  const logos = (avatars === 0 ? 0 : AVATAR_PX + (avatars - 1) * (GAP_PX + AVATAR_PX)) + more
  return Math.max(logos, TRIGGER_MIN_PX)
}

/** Call from `beforeEach`; the returned function restores jsdom's own getters. */
export function installFakeLayout(): () => void {
  const original = {
    clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
    scrollWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth'),
  }

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return isRow(this) ? availableWidth : 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return isRow(this) ? naturalWidth(this) : 0
    },
  })

  return () => {
    if (original.clientWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', original.clientWidth)
    }
    if (original.scrollWidth) {
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', original.scrollWidth)
    }
    availableWidth = 0
  }
}

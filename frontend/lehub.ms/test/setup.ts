/**
 * jsdom gaps that the shell trips over.
 *
 * Assigned directly rather than through `vi.stubGlobal`, because `test/api.test.ts`
 * calls `vi.unstubAllGlobals()` in an `afterEach` and would otherwise tear these down
 * mid-file.
 */

type MediaListener = (event: MediaQueryListEvent) => void

let desktopMatches = false
let reducedMotionMatches = false
const listeners = new Set<MediaListener>()

/** Simulate the viewport crossing Tailwind's `md` breakpoint, in either direction. */
export function setDesktopViewport(matches: boolean): void {
  desktopMatches = matches
  const event = { matches, media: '(min-width: 768px)' } as MediaQueryListEvent
  for (const listener of [...listeners]) listener(event)
}

/** Simulate the OS/browser `prefers-reduced-motion: reduce` setting. */
export function setPrefersReducedMotion(matches: boolean): void {
  reducedMotionMatches = matches
}

/** Call between tests so a stale listener from a previous render cannot fire. */
export function resetViewport(): void {
  desktopMatches = false
  reducedMotionMatches = false
  listeners.clear()
}

// jsdom ships no `matchMedia` at all, and NavBar/CommunitiesCarousel call it on mount.
// Query-aware because two independent stubs share this one function: NavBar's desktop
// breakpoint check and CommunitiesCarousel's `prefers-reduced-motion` check.
window.matchMedia = (query: string): MediaQueryList => {
  const matchesFor = () => (query === '(prefers-reduced-motion: reduce)' ? reducedMotionMatches : desktopMatches)
  const list = {
    media: query,
    get matches(): boolean {
      return matchesFor()
    },
    onchange: null,
    addEventListener: (_type: string, listener: MediaListener) => {
      listeners.add(listener)
    },
    removeEventListener: (_type: string, listener: MediaListener) => {
      listeners.delete(listener)
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }
  // The real interface carries overloaded listener signatures that this stub does not
  // need; casting is honest here and keeps the file free of `any`.
  return list as unknown as MediaQueryList
}

// jsdom's `scrollTo` is a notImplementedMethod, which <ScrollRestoration /> would trip
// on every navigation, flooding the run with virtual-console errors.
window.scrollTo = () => undefined

// `HomePage` renders `CommunitiesCarousel`, which fetches on mount. Without a default
// here, every test that renders `/` — most of footer/navbar/routing's tests included,
// not just this component's own — would fire a real, unmocked network request. Tests
// that care about a specific response stub over this with `vi.stubGlobal('fetch', ...)`,
// which restores this default afterwards, exactly like `matchMedia` above.
//
// A test that renders `/` and doesn't itself await that fetch (most of
// footer/navbar/routing's tests) can log a harmless "not wrapped in act(...)" warning
// when the promise resolves after the test's own assertions already ran — a global
// flush here to silence it was tried and reverted: forcing every test file through an
// extra `act()` cycle between tests corrupted React's scheduler state across tests in
// this same file, turning a cosmetic warning into real `findByRole` timeouts. Tests
// that need the carousel already `await screen.findByRole(...)`, which is the correct,
// scoped place to wait for it.
window.fetch = () =>
  Promise.resolve(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }))

// jsdom ships no `PointerEvent` at all (confirmed: `'PointerEvent' in window` is
// `false`). React gates its pointer-event listener registration on that check, so
// without this, `EventFilterDrawer`'s onPointerDown/Move/Up handlers never fire in
// tests — not because the drag logic is wrong, but because React never attaches a
// native listener for a pointer type it believes the environment can't emit.
class PointerEventPolyfill extends MouseEvent {
  readonly pointerId: number
  // Carried through because `EntityRow` branches on it: hover opens its popover only for a
  // mouse, since on touch `pointerover` fires immediately before the tap Radix already
  // handles. Dropping it here would make every synthetic pointer read as `undefined` and
  // silently take the non-mouse path.
  readonly pointerType: string
  readonly isPrimary: boolean

  constructor(type: string, params: PointerEventInit = {}) {
    super(type, params)
    this.pointerId = params.pointerId ?? 0
    this.pointerType = params.pointerType ?? ''
    this.isPrimary = params.isPrimary ?? false
  }
}

window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent

// jsdom implements no part of the Pointer Capture API either, and `vaul` captures the
// pointer on every press inside the drawer so the gesture survives the finger leaving
// the sheet. Without these, that single call throws out of React's dispatch and turns
// every pointer interaction in the drawer — a checkbox tap included — into an unhandled
// error. Capture semantics themselves don't matter here: jsdom has no compositor, so
// events already reach their target either way.
Element.prototype.setPointerCapture = () => undefined
Element.prototype.releasePointerCapture = () => undefined
Element.prototype.hasPointerCapture = () => false

// jsdom resolves no stylesheet, so `getComputedStyle(el).transform` comes back as the
// empty string where a browser always yields `'none'` or a matrix. `vaul` reads it on
// every pointer event to know how far the sheet has already been dragged and calls
// `.match()` on it without a guard, so the empty string — falsy, and with no
// `webkitTransform`/`mozTransform` behind it to fall back to — throws out of the pointer
// handler and the drag never starts. Substituting the CSS-wide initial value is enough:
// jsdom would not resolve an inline `translate3d` into a matrix either way, so vaul reads
// "not dragged yet" and drives the sheet from the pointer positions the test dispatches.
// Everything jsdom does compute is passed straight through.
const nativeGetComputedStyle = window.getComputedStyle.bind(window)

window.getComputedStyle = (element: Element, pseudoElement?: string | null) => {
  const style = nativeGetComputedStyle(element, pseudoElement)
  if (!style.transform) {
    Object.defineProperty(style, 'transform', { value: 'none', configurable: true })
  }
  return style
}

// jsdom ships no `ResizeObserver`, and `EntityRow` constructs one on mount — without this
// every test that renders an `EventCard` throws. Kept observable rather than a bare no-op
// so a test can fire the callbacks and assert that a row grows its pills back when its
// column widens (see `entityRow.test.tsx`).
interface ObservedTarget {
  callback: ResizeObserverCallback
  targets: Set<Element>
}

const resizeObservers = new Set<ObservedTarget>()

/** Fire every live `ResizeObserver` callback, simulating a layout change. */
export function triggerResizeObservers(): void {
  for (const { callback, targets } of [...resizeObservers]) {
    // `EntityRow` re-reads `clientWidth` from the element and ignores the entries, so
    // these only have to satisfy the signature.
    const entries = [...targets].map((target) => ({ target }) as ResizeObserverEntry)
    callback(entries, {} as ResizeObserver)
  }
}

class ResizeObserverStub {
  private readonly registration: ObservedTarget

  constructor(callback: ResizeObserverCallback) {
    this.registration = { callback, targets: new Set() }
    resizeObservers.add(this.registration)
  }

  observe(target: Element): void {
    this.registration.targets.add(target)
  }

  unobserve(target: Element): void {
    this.registration.targets.delete(target)
  }

  disconnect(): void {
    this.registration.targets.clear()
    resizeObservers.delete(this.registration)
  }
}

window.ResizeObserver = ResizeObserverStub

// jsdom implements no part of the CSS Font Loading API, and `EntityRow` awaits
// `document.fonts.ready` to measure again once the real face has swapped in for the
// `font-display: swap` fallback. Stubbed as a promise that stays pending until a test
// settles it: harmless in every other file, and assertable here (see `entityRow.test.tsx`).
let resolveFontsReady: () => void = () => undefined
let fontsReady = new Promise<void>((resolve) => {
  resolveFontsReady = resolve
})

/**
 * Resolve `document.fonts.ready`, then re-arm it for whatever mounts next. Awaiting the
 * returned promise lets the `.then` callbacks already attached to the old one run.
 */
export function settleFonts(): Promise<void> {
  const resolve = resolveFontsReady
  fontsReady = new Promise<void>((next) => {
    resolveFontsReady = next
  })
  resolve()
  return Promise.resolve()
}

Object.defineProperty(document, 'fonts', {
  configurable: true,
  // A getter, so a re-armed promise reaches the next mount. Only `ready` is stubbed —
  // nothing in the app touches the rest of the interface.
  get: () => ({
    get ready() {
      return fontsReady
    },
  }),
})

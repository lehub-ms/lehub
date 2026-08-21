/**
 * jsdom gaps that the shell trips over.
 *
 * Assigned directly rather than through `vi.stubGlobal`, because `test/api.test.ts`
 * calls `vi.unstubAllGlobals()` in an `afterEach` and would otherwise tear these down
 * mid-file.
 */

type MediaListener = (event: MediaQueryListEvent) => void

let desktopMatches = false
const listeners = new Set<MediaListener>()

/** Simulate the viewport crossing Tailwind's `md` breakpoint, in either direction. */
export function setDesktopViewport(matches: boolean): void {
  desktopMatches = matches
  const event = { matches, media: '(min-width: 768px)' } as MediaQueryListEvent
  for (const listener of [...listeners]) listener(event)
}

/** Call between tests so a stale listener from a previous render cannot fire. */
export function resetViewport(): void {
  desktopMatches = false
  listeners.clear()
}

// jsdom ships no `matchMedia` at all, and NavBar calls it on mount.
window.matchMedia = (query: string): MediaQueryList => {
  const list = {
    media: query,
    get matches(): boolean {
      return desktopMatches
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

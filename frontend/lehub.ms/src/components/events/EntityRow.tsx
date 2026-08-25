import {
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import * as Popover from '@radix-ui/react-popover'
import type { NamedRef } from '@/lib/api'
import { cn } from '@/lib/cn'
import { EntityAvatar, type EntityKind } from './EntityAvatar'

const AVATAR_PX = 20

/**
 * Separates two pills, and two logos. The same on both sides, so the row keeps its rhythm
 * across a mode switch — and it is a real gap, never a negative margin: the logos sit side
 * by side, because overlapping them would cost legibility without buying any width that
 * dropping the names has not already freed.
 */
const GAP_CLASS = 'gap-1'

/**
 * Both modes occupy the same fixed height on purpose. A mode switch that changed the
 * card's height could add or remove the page's scrollbar, which changes the grid column
 * width, which re-triggers the measurement below — a real oscillation. It also gives the
 * logo row's trigger the 44px tap target the accessibility floor requires: the row is
 * `overflow-hidden`, so a pseudo-element hit area would simply be clipped away.
 */
const ROW_CLASSES = `flex h-11 w-full min-w-0 items-center ${GAP_CLASS} overflow-hidden`

/** The pointer has to cross the popover's offset; closing on `pointerleave` would cut it off. */
const CLOSE_DELAY_MS = 120

type Layout = { kind: 'full' } | { kind: 'logos'; visibleCount: number }

interface EntityRowProps {
  entities: NamedRef[]
  kind: EntityKind
  /** Names the dimension: "Organisé par", "Technologies abordées". */
  label: string
  className?: string
}

/**
 * One line, always — for communities and for technologies alike, `kind` only selecting
 * the avatar's fallback colour.
 *
 * Full pills (logo + name) while they all fit; otherwise the logos alone, laid side by
 * side and never overlapping — dropping the names already frees the width the row was
 * missing, and stacking the marks would only cost legibility on top of it; otherwise as
 * many logos as fit plus a "+N". The logo-only forms are a popover trigger, because that
 * is the only place a name would otherwise be unreachable.
 */
export function EntityRow({ entities, kind, label, className }: EntityRowProps) {
  // Keyed on the set's identity so a refetch that swaps the list remounts with a fresh
  // `Layout` rather than resetting it from an effect — same reasoning as `FilterSection`'s
  // summary chips.
  const key = entities.map((entity) => entity.id).join(',')
  return <MeasuredEntityRow key={key} entities={entities} kind={kind} label={label} className={className} />
}

function MeasuredEntityRow({ entities, kind, label, className }: EntityRowProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<Layout>({ kind: 'full' })
  /** A reset held back because the row had focus; replayed on the way out. */
  const pendingReset = useRef(false)

  // The descent: `full` → `logos(n)` → `logos(n-1)` → … → `logos(1)`. Every transition
  // moves strictly down a totally ordered space, so it terminates in at most n passes.
  // `useLayoutEffect` runs before paint, so none of the intermediate states is ever shown.
  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return
    // No layout to read yet — jsdom, or a `display:none` ancestor. Every measurement would
    // be 0 and `scrollWidth > 0 > clientWidth === 0` would collapse the row on meaningless
    // numbers. The observer below re-enters the moment a real box exists.
    if (row.clientWidth === 0) return
    if (row.scrollWidth <= row.clientWidth) return

    setLayout((current) => {
      // One measurement may only ever produce one step. StrictMode invokes this effect
      // twice per commit, and both invocations queue an updater; without this the second
      // would step again on the result of the first and shrink the row one notch too far
      // — invisible in a bare test render, wrong on every real page.
      if (current !== layout) return current
      if (current.kind === 'full') return { kind: 'logos', visibleCount: entities.length }
      // Floor at one logo: a lone "+N" would say nothing at all about the row's contents.
      // Returning the very same object rather than an equal one is what ends the descent —
      // React bails out on `Object.is`, so `layout` does not change and this effect, which
      // depends on it, is not re-run. An equal-but-new object would loop forever.
      if (current.visibleCount <= 1) return current
      return { kind: 'logos', visibleCount: current.visibleCount - 1 }
    })
    // `layout` is what makes the effect re-run after each step, so the descent advances
    // exactly one state per commit.
  }, [layout, entities.length])

  // Re-enter the descent from the top — the layout effect only ever shrinks, so every
  // cause that could make the row fit again has to come back through here.
  const resetLayout = useCallback(() => {
    const row = rowRef.current
    // Growing back to `full` unmounts the logo row's popover trigger. Dropping it while it
    // holds focus would send focus to `<body>`, and the next Tab would restart from the top
    // of the page — so the reset waits for focus to leave, at the price of a row that may
    // stay one notch too narrow in the meantime. Deferred whichever way the width moved:
    // the descent unmounts that same trigger on its way back down too.
    if (row?.contains(document.activeElement)) {
      pendingReset.current = true
      return
    }
    setLayout({ kind: 'full' })
  }, [])

  // The reset. The card sits in a grid whose column width changes without the window ever
  // resizing: the desktop filter panel only mounts once the events resolve, and filtering
  // shortens the page enough to drop the scrollbar. A `window.resize` listener sees
  // neither. Observing the row itself sees both — and covers the 0-width bail-out above.
  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    let lastWidth = row.clientWidth
    const observer = new ResizeObserver(() => {
      const width = row.clientWidth
      // `observe()` fires once immediately, and a height-only change fires too; neither
      // needs a re-render.
      if (width === lastWidth) return
      lastWidth = width
      resetLayout()
    })
    observer.observe(row)
    return () => {
      observer.disconnect()
    }
  }, [resetLayout])

  // The other reset. The measurement reads the pills with whatever face is painting at that
  // moment, and the self-hosted DM Sans is `font-display: swap`: on a cold cache the first
  // pass measures the fallback. When the real font arrives the text changes width but the
  // row's box does not — it is `w-full h-11` — so the observer above sees nothing, and a row
  // that was measured as fitting silently clips under `overflow-hidden`. Measuring again
  // once the fonts have settled is what closes it.
  useEffect(() => {
    // Absent from jsdom and from browsers without the CSS Font Loading API.
    const fonts: FontFaceSet | undefined = document.fonts
    if (!fonts) return
    let cancelled = false
    void fonts.ready.then(() => {
      if (cancelled) return
      resetLayout()
    })
    return () => {
      cancelled = true
    }
  }, [resetLayout])

  if (layout.kind === 'full') {
    return (
      <div
        ref={rowRef}
        data-testid="entity-row"
        data-fit-mode="full"
        // The names alone say nothing about which dimension they belong to, and both rows
        // wear the same neutral pill — so the label the logo-only form carries on its
        // trigger has to be here too. A group rather than a bare `aria-label`, which an
        // element with no role would simply drop.
        role="group"
        aria-label={label}
        className={cn(ROW_CLASSES, className)}
      >
        {entities.map((entity) => (
          <span
            key={entity.id}
            data-pill=""
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 py-0.5 pr-2.5 pl-0.5 text-xs font-medium whitespace-nowrap text-slate-600"
          >
            <EntityAvatar entity={entity} kind={kind} size={AVATAR_PX} hidden />
            {entity.name}
          </span>
        ))}
      </div>
    )
  }

  const visible = entities.slice(0, layout.visibleCount)
  const hiddenCount = entities.length - visible.length

  return (
    <div
      ref={rowRef}
      data-testid="entity-row"
      data-fit-mode="logos"
      // `focusout`, which is what React's `onBlur` actually is, so it catches focus leaving
      // the trigger below. A reset held back while that trigger had focus runs here.
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return
        if (!pendingReset.current) return
        pendingReset.current = false
        setLayout({ kind: 'full' })
      }}
      className={cn(ROW_CLASSES, className)}
    >
      <EntityLogosPopover entities={entities} kind={kind} label={label}>
        {visible.map((entity) => (
          <EntityAvatar key={entity.id} entity={entity} kind={kind} size={AVATAR_PX} hidden />
        ))}
        {hiddenCount > 0 && (
          <span
            aria-hidden="true"
            data-more=""
            style={{ height: AVATAR_PX, minWidth: AVATAR_PX }}
            className="flex shrink-0 items-center justify-center rounded-full bg-primary-xs px-1 text-[0.5625rem] font-bold text-primary"
          >
            +{hiddenCount}
          </span>
        )}
      </EntityLogosPopover>
    </div>
  )
}

interface EntityLogosPopoverProps {
  entities: NamedRef[]
  kind: EntityKind
  label: string
  children: ReactNode
}

/**
 * The logo-only form hides every name, so it has to hand them back. A popover rather than
 * a tooltip because only a popover's trigger is a real button: tap and Enter/Space come
 * for free, and hover is the small addition on top.
 */
function EntityLogosPopover({ entities, kind, label, children }: EntityLogosPopoverProps) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<number | undefined>(undefined)

  const cancelClose = useCallback(() => {
    window.clearTimeout(closeTimer.current)
  }, [])

  // Mouse only. On touch, `pointerenter` fires immediately before the click Radix's own
  // trigger already handles, so an unguarded hover would open and close in the same tap.
  const handleEnter = useCallback((event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    window.clearTimeout(closeTimer.current)
    setOpen(true)
  }, [])

  const handleLeave = useCallback((event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    closeTimer.current = window.setTimeout(() => {
      setOpen(false)
    }, CLOSE_DELAY_MS)
  }, [])

  useEffect(
    () => () => {
      window.clearTimeout(closeTimer.current)
    },
    [],
  )

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        // The full list is the trigger's own accessible name, not only the panel's
        // content: a keyboard or screen-reader user gets every name without opening
        // anything, which is what makes the logo-only form as informative as the full one.
        aria-label={`${label} : ${entities.map((entity) => entity.name).join(', ')}`}
        onPointerEnter={handleEnter}
        onPointerLeave={handleLeave}
        // Radix's own trigger toggles on click, which is the tap and the keyboard path.
        // With a mouse the hover has already opened this, so a click closes it again —
        // deliberately left alone: every way of suppressing it keys off state the browser
        // does not reliably deliver (a `pointerleave` that never fires, a `pointerType`
        // that varies by event source) and ends up swallowing real taps.
        // `min-w-11` with the row's `h-11` is the 44x44 tap target the project floor
        // requires; the extra width is empty hit area to the right of the avatars.
        className={cn('flex h-full min-w-11 shrink-0 items-center justify-start rounded-full', GAP_CLASS)}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        {/* Portalled to the body, which is what escapes the card's `overflow-hidden` — an
            in-flow panel would simply be clipped by the article. */}
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onPointerEnter={cancelClose}
          onPointerLeave={handleLeave}
          // Hover must never move focus, and a hover-close must never yank it back. Focus
          // stays on the trigger, whose `aria-label` already carries the whole list.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
          }}
          // Under the nav bar (z-50) and the filter drawer (z-290/300).
          className="glass-strong z-40 max-w-64 rounded-2xl p-3 shadow-lg"
        >
          <p className="mb-2 text-[0.6875rem] font-bold tracking-[0.08em] text-ink-muted uppercase">
            {label}
          </p>
          <ul className="flex flex-col gap-1.5">
            {entities.map((entity) => (
              <li key={entity.id} className="flex items-center gap-2 text-xs text-ink-body">
                <EntityAvatar entity={entity} kind={kind} size={20} hidden />
                <span className="min-w-0 truncate">{entity.name}</span>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

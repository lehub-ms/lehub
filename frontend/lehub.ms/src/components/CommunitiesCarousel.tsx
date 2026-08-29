import type { KeyboardEvent, RefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { cn } from '@shared/lib/cn'
import { listCommunities, type CommunitySummary } from '@/lib/api'
import { orderForSession } from '@/lib/communitiesSessionOrder'

/** Matches the `gap-6` Tailwind class on the track. */
const CARD_GAP_PX = 24
const AUTO_SCROLL_SPEED_PX = 0.4
const STEP_TRANSITION_MS = 400

const NAV_BUTTON_CLASSES =
  'absolute top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-primary/20 bg-white text-primary shadow-[0_2px_8px_rgb(0_95_184/0.12)] transition-colors hover:bg-primary-xs disabled:pointer-events-none disabled:opacity-35'

interface CommunityCardProps {
  community: CommunitySummary
  cardRef?: RefObject<HTMLDivElement | null>
  ariaHidden?: boolean
}

function CommunityCard({ community, cardRef, ariaHidden }: CommunityCardProps) {
  // logoUrl is served from the media storage account, whose host the deployment chain adds
  // to the CSP's img-src — so a cross-origin logo does load. What it does not guarantee is
  // that the blob behind the stored path exists: the API composes the URL without checking.
  // onError therefore has to fall back to the same placeholder as a genuinely absent logo.
  const [logoFailed, setLogoFailed] = useState(false)
  const { logoUrl } = community

  return (
    <div
      ref={cardRef}
      aria-hidden={ariaHidden ? 'true' : undefined}
      className="glass flex w-[260px] shrink-0 flex-col gap-3.5 rounded-[20px] p-6 sm:w-[300px]"
    >
      {logoUrl && !logoFailed ? (
        <div className="flex size-[52px] items-center justify-center overflow-hidden rounded-2xl bg-white">
          <img
            src={logoUrl}
            alt={community.name}
            onError={() => setLogoFailed(true)}
            className="size-full object-contain"
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="flex size-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-light"
        >
          <Users aria-hidden="true" className="size-[26px] text-white" />
        </div>
      )}

      <h3 className="line-clamp-2 font-heading text-base font-bold text-ink">{community.name}</h3>

      {community.description && (
        <p className="line-clamp-3 text-sm leading-relaxed text-ink-muted">
          {community.description}
        </p>
      )}
    </div>
  )
}

interface CarouselProps {
  communities: CommunitySummary[]
}

/**
 * Infinite auto-scroll, mirroring the Claude Design mock-up's vanilla-JS carousel: the
 * track is duplicated once so wrapping the transform modulo one loop's width reads as a
 * seamless loop. Card width is measured from the DOM (not hard-coded) so it tracks the
 * responsive width set on `CommunityCard`.
 */
function Carousel({ communities }: CarouselProps) {
  const loop = communities.length > 1
  const trackRef = useRef<HTMLDivElement>(null)
  const firstCardRef = useRef<HTMLDivElement>(null)
  const positionRef = useRef(0)
  const cardStepRef = useRef(0)
  /** Set only by hover — the one pause the auto-scroll must not clear on its own. */
  const hoverPausedRef = useRef(false)
  /** Set only during a manual step's transition, to keep it from fighting the rAF loop. */
  const steppingRef = useRef(false)
  const reducedMotionRef = useRef(false)

  useEffect(() => {
    function measure() {
      if (firstCardRef.current) {
        cardStepRef.current = firstCardRef.current.getBoundingClientRect().width + CARD_GAP_PX
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const setPosition = useCallback(
    (next: number) => {
      const track = trackRef.current
      if (!track) return
      const loopWidth = cardStepRef.current * communities.length
      const wrapped = loopWidth > 0 ? ((next % loopWidth) + loopWidth) % loopWidth : 0
      positionRef.current = wrapped
      track.style.transform = `translateX(${-wrapped}px)`
    },
    [communities.length],
  )

  const step = useCallback(
    (direction: 1 | -1) => {
      // Ignored while a previous step is still animating, rather than restarting the
      // transition mid-flight — a rapid second click/key-press would otherwise clear
      // the in-progress transition early and let the auto-scroll loop resume against
      // a track that hasn't finished moving yet, producing a visible jump.
      if (!loop || steppingRef.current) return
      steppingRef.current = true
      const track = trackRef.current
      if (track) track.style.transition = `transform ${STEP_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
      setPosition(positionRef.current + direction * cardStepRef.current)
      window.setTimeout(() => {
        if (track) track.style.transition = ''
        steppingRef.current = false
      }, STEP_TRANSITION_MS + 20)
    },
    [loop, setPosition],
  )

  useEffect(() => {
    // The loop drives `transform` directly via rAF, not a CSS transition/animation, so
    // the global `prefers-reduced-motion` rule in index.css cannot catch it — it has to
    // be read here instead, and kept live: a change listener rather than a one-time
    // check at mount, so toggling the OS setting mid-session takes effect immediately.
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = query.matches
    const onChange = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!loop) return

    let frame: number
    function tick() {
      if (!hoverPausedRef.current && !steppingRef.current && !reducedMotionRef.current) {
        setPosition(positionRef.current + AUTO_SCROLL_SPEED_PX)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [loop, setPosition])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      step(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      step(1)
    }
  }

  return (
    <div
      role="region"
      aria-label="Carrousel des communautés partenaires"
      onMouseEnter={() => {
        hoverPausedRef.current = true
      }}
      onMouseLeave={() => {
        hoverPausedRef.current = false
      }}
      onKeyDown={handleKeyDown}
      className="relative mx-auto max-w-[1200px] px-4 md:px-16"
    >
      <button
        type="button"
        aria-label="Précédent"
        disabled={!loop}
        onClick={() => step(-1)}
        className={cn(NAV_BUTTON_CLASSES, 'left-0')}
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
      </button>

      <div className="overflow-hidden">
        <div
          ref={trackRef}
          // The animated position lives only in `style.transform`, driven by rAF rather
          // than a class or CSS variable — a test hook is the only way to assert on it.
          data-testid="communities-track"
          className="flex gap-6 py-2 pb-4 will-change-transform"
        >
          {communities.map((community, index) => (
            <CommunityCard
              key={community.id}
              community={community}
              cardRef={index === 0 ? firstCardRef : undefined}
            />
          ))}
          {loop &&
            communities.map((community) => (
              <CommunityCard key={`${community.id}-clone`} community={community} ariaHidden />
            ))}
        </div>
      </div>

      <button
        type="button"
        aria-label="Suivant"
        disabled={!loop}
        onClick={() => step(1)}
        className={cn(NAV_BUTTON_CLASSES, 'right-0')}
      >
        <ChevronRight aria-hidden="true" className="size-5" />
      </button>
    </div>
  )
}

type Status = 'loading' | 'error' | 'ready'

const STATUS_MESSAGE_CLASSES = 'text-center text-sm text-ink-muted'

/**
 * Fetches every community and renders them as an auto-scrolling carousel. Self-contained
 * like `NavBar`: owns its own data fetching, ordering and animation, so `HomePage` only
 * has to render it in place of the section's placeholder.
 */
export function CommunitiesCarousel() {
  const [status, setStatus] = useState<Status>('loading')
  const [communities, setCommunities] = useState<CommunitySummary[]>([])

  useEffect(() => {
    let cancelled = false

    listCommunities()
      .then((result) => {
        if (cancelled) return
        setCommunities(orderForSession(result))
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (status === 'loading') {
    return <p className={STATUS_MESSAGE_CLASSES}>Chargement des communautés…</p>
  }

  if (status === 'error') {
    return (
      <p className={STATUS_MESSAGE_CLASSES}>
        Impossible de charger les communautés partenaires pour le moment.
      </p>
    )
  }

  if (communities.length === 0) {
    return <p className={STATUS_MESSAGE_CLASSES}>Aucune communauté partenaire à afficher pour le moment.</p>
  }

  return <Carousel communities={communities} />
}

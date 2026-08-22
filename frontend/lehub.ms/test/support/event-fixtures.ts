import type { EventSummary, NamedRef } from '@/lib/api'

export function buildNamedRef(prefix: string, index = 1, logoUrl: string | null = null): NamedRef {
  return { id: `${prefix}-${index}`, name: `${prefix} ${index}`, logoUrl }
}

export function buildEvent(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: 'event-1',
    title: 'Azure Community Day Paris',
    description: 'Une journée dédiée aux dernières actualités Azure.',
    startDate: '2026-03-15T18:00:00.000Z',
    endDate: '2026-03-15T20:00:00.000Z',
    bannerImageUrl: null,
    format: 'Conférence',
    mode: 'Présentiel',
    communities: [buildNamedRef('community')],
    technologies: [buildNamedRef('technology')],
    ...overrides,
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch } from '../src/lib/api'
import { cn } from '../src/lib/cn'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch', () => {
  it('calls the API on its own origin, not a relative path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/events')

    expect(fetchMock).toHaveBeenCalledOnce()
    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toBe('http://localhost:7071/api/events')
  })

  it('reports a blocked or unreachable request as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(apiFetch('/api/events')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
    })
  })

  it('surfaces the HTTP status when the API answers with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))

    await expect(apiFetch('/api/events')).rejects.toBeInstanceOf(ApiError)
    await expect(apiFetch('/api/events')).rejects.toMatchObject({ status: 500 })
  })
})

describe('cn', () => {
  it('lets the last conflicting Tailwind utility win', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('drops falsy conditional classes', () => {
    const isHidden = false
    expect(cn('text-sm', isHidden && 'hidden', 'font-bold')).toBe('text-sm font-bold')
  })
})

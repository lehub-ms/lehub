import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, getHealth } from '../src/lib/api'

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('apiFetch', () => {
  it('calls the shared API on its own origin, not a relative path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/health')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:7071/api/health')
  })

  it('reports a blocked or unreachable request as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(apiFetch('/api/health')).rejects.toMatchObject({ name: 'ApiError', status: 0 })
  })

  it('surfaces an authorisation refusal as an ApiError carrying the status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 403)))

    await expect(apiFetch('/api/admin/events')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('getHealth', () => {
  it('returns the probe payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ status: 'ok', sqlConfigured: true, timestamp: '2026-01-01T00:00:00.000Z' }),
      ),
    )

    await expect(getHealth()).resolves.toMatchObject({ status: 'ok', sqlConfigured: true })
  })
})

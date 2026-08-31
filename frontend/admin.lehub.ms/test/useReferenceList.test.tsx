import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useReferenceList } from '@/hooks/useReferenceList'

/**
 * Un `load` qu'on résout à la main, pour observer la fenêtre entre deux lectures — c'est
 * précisément là que le défaut vivait, et une lecture qui se résout toute seule la referme trop
 * vite pour qu'on la voie.
 */
function deferred<T>(): { load: () => Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { load: () => promise, resolve }
}

describe('useReferenceList', () => {
  it('repasse « en cours » quand la portée lue change, sans montrer la précédente', async () => {
    // Le défaut : `OrganizersPage` reconstruit son `load` à partir de la communauté de l'URL, et
    // changer de communauté ne remonte pas l'écran. Tant que seul le jeton de rechargement était
    // comparé, la table gardait les organisateurs de la communauté précédente pendant toute la
    // lecture de la suivante, alors que les actions de ligne visaient déjà la nouvelle.
    const first = deferred<string[]>()
    const second = deferred<string[]>()

    const { result, rerender } = renderHook(
      ({ load }: { load: () => Promise<string[]> }) => useReferenceList(load),
      { initialProps: { load: first.load } },
    )

    first.resolve(['Amélie'])
    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    rerender({ load: second.load })
    // Le point du test : pas « success » avec « Amélie » encore à l'écran.
    expect(result.current.status).toBe('loading')

    second.resolve(['Julien'])
    await waitFor(() => {
      expect(result.current).toMatchObject({ status: 'success', entries: ['Julien'] })
    })
  })

  it('garde son résultat tant que la portée ne change pas', async () => {
    // Le pendant : un rendu de plus avec le même `load` ne doit pas relancer la lecture ni
    // faire clignoter la table.
    const { load, resolve } = deferred<string[]>()
    const { result, rerender } = renderHook(
      ({ load: l }: { load: () => Promise<string[]> }) => useReferenceList(l),
      { initialProps: { load } },
    )

    resolve(['Amélie'])
    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    rerender({ load })
    expect(result.current).toMatchObject({ status: 'success', entries: ['Amélie'] })
  })

  it('rend l’erreur de la portée courante, et non celle de la précédente', async () => {
    const first = deferred<string[]>()
    const { result, rerender } = renderHook(
      ({ load }: { load: () => Promise<string[]> }) => useReferenceList(load),
      { initialProps: { load: first.load } },
    )

    first.resolve(['Amélie'])
    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    const failing = () => Promise.reject(new Error('boom'))
    rerender({ load: failing })

    await waitFor(() => {
      expect(result.current.status).toBe('error')
    })
  })
})

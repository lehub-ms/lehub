import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../src/auth/AuthContext'
import { postAuthStep } from '../src/auth/authClient'
import { RESET_SENT_MESSAGE } from '../src/lib/authErrors'
import { useResetFlow } from '../src/auth/useResetFlow'

// Le transport est bouchonné : ce qui se teste ici est la machine à états du parcours, pas
// l'aller-retour HTTP, que `frontend/lehub.ms/test/resetPassword.test.tsx` exerce de bout en
// bout à travers l'écran.
vi.mock('../src/auth/authClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/auth/authClient')>()),
  postAuthStep: vi.fn(),
}))

const step = vi.mocked(postAuthStep)

const session: AuthContextValue = {
  state: { status: 'anonymous' },
  completeSignIn: vi.fn(),
  signOut: vi.fn(),
}

function wrapper({ children }: { children: ReactNode }): ReactNode {
  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>
}

beforeEach(() => {
  step.mockReset()
})

/**
 * La propriété la plus coûteuse à perdre du parcours, et celle qu'aucun écran ne montre :
 * une adresse inconnue doit être indiscernable d'une adresse connue. Le tenant, lui, répond
 * `user_not_found` en clair — c'est un oracle d'existence de compte, et le hook est le seul
 * endroit qui l'absorbe.
 */
describe('la réinitialisation face à une adresse inconnue', () => {
  it('avance vers l’écran de code avec le même message qu’un compte existant', async () => {
    step.mockResolvedValueOnce({ ok: false, error: { error: 'user_not_found' }, data: {} })

    const { result } = renderHook(() => useResetFlow(), { wrapper })
    await act(async () => {
      await result.current.requestCode('inconnu@example.org')
    })

    await waitFor(() => {
      expect(result.current.stage).toBe('code')
    })
    expect(result.current.notice).toBe(RESET_SENT_MESSAGE)
    expect(result.current.error).toBeNull()
    expect(result.current.targetLabel).toBe('inconnu@example.org')
    // Une seule étape appelée : le parcours n'a jamais demandé de code au tenant.
    expect(step).toHaveBeenCalledTimes(1)
  })

  it('refuse ensuite le code comme un code incorrect, sans interroger le tenant', async () => {
    step.mockResolvedValueOnce({ ok: false, error: { error: 'user_not_found' }, data: {} })

    const { result } = renderHook(() => useResetFlow(), { wrapper })
    await act(async () => {
      await result.current.requestCode('inconnu@example.org')
    })
    step.mockClear()

    await act(async () => {
      await result.current.submitCode('12345678')
    })

    await waitFor(() => {
      expect(result.current.error).not.toBeNull()
    })
    // Le refus est produit localement : sans jeton de continuation, il n'y a rien à envoyer,
    // et un appel réseau ici trahirait par sa seule absence que le compte n'existe pas.
    expect(step).not.toHaveBeenCalled()
    expect(result.current.stage).toBe('code')
  })
})

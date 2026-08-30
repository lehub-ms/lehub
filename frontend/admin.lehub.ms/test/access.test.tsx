import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PATHS } from '@/lib/navigation'
import { renderAt } from './support/render-route'
import { COMMUNITIES, GLOBAL_ADMIN, ORDINARY_USER, ORGANIZER } from './support/session-fixtures'
import { stubSignedIn } from './support/stub-session'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('accès au backoffice', () => {
  it('renvoie un visiteur non connecté vers la connexion, et retient la page demandée', async () => {
    const { router } = renderAt('/')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.signIn)
    })
    // La destination voyage dans l'état de navigation, jamais dans l'URL : elle n'a pas à
    // être partageable.
    expect(router.state.location.state).toEqual({ from: '/' })
    expect(await screen.findByRole('heading', { name: /console de gestion/i })).toBeTruthy()
  })

  it('retient aussi un lien profond, pas seulement la racine', async () => {
    const { router } = renderAt('/une-section?filtre=azure')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.signIn)
    })
    expect(router.state.location.state).toEqual({ from: '/une-section?filtre=azure' })
  })

  it('retient le fragment avec le reste de la destination', async () => {
    const { router } = renderAt('/une-section?filtre=azure#detail')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.signIn)
    })
    // Aucune route du backoffice ne porte de fragment aujourd'hui : la règle se pose pendant
    // qu'elle est gratuite, pas le jour où un lien profond en perdra un en silence.
    expect(router.state.location.state).toEqual({ from: '/une-section?filtre=azure#detail' })
  })

  it("montre l'écran d'absence d'accès à un compte connecté sans habilitation", async () => {
    stubSignedIn(ORDINARY_USER)
    const { router } = renderAt('/')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.noAccess)
    })
    // Ni page vide, ni boucle de connexion : il est connecté, il n'a pas accès, il sait à
    // qui s'adresser.
    expect(screen.getByRole('heading', { name: /n’avez pas accès/i })).toBeTruthy()
    // Il sait à qui s'adresser : la marche à suivre est écrite, pas seulement le refus.
    expect(screen.getByText(/L’accès se demande à un administrateur/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /se déconnecter/i })).toBeTruthy()
  })

  it('ne laisse rien filtrer de la page visée par un lien profond non habilité', async () => {
    stubSignedIn(ORDINARY_USER)
    renderAt('/une-section')

    expect(await screen.findByRole('heading', { name: /n’avez pas accès/i })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /page introuvable/i })).toBeNull()
  })

  it("ne laisse pas un compte habilité sur l'écran d'absence d'accès", async () => {
    stubSignedIn(ORGANIZER)
    const { router } = renderAt(PATHS.noAccess)

    // La garde est symétrique, sans quoi elle ment : `/acces-refuse` est retenu comme
    // destination à la déconnexion, et la connexion suivante d'un compte habilité y atterrit.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.home)
    })
    expect(screen.queryByRole('heading', { name: /n’avez pas accès/i })).toBeNull()
  })

  it('laisse entrer un organisateur, sur les évènements de sa communauté', async () => {
    stubSignedIn(ORGANIZER)
    const { router } = renderAt('/')

    // L'entrée du backoffice n'est plus un écran depuis #141 : c'est une redirection vers
    // la section communauté, et un organisateur n'y atterrit que sur les siennes.
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/c/${COMMUNITIES[0]!.id}/evenements`),
    )
    expect(await screen.findByRole('heading', { name: 'Évènements' })).toBeTruthy()
  })

  it('laisse entrer un administrateur global, même sans communauté', async () => {
    stubSignedIn(GLOBAL_ADMIN)
    const { router } = renderAt('/')

    // Un administrateur n'organise rien et voit pourtant toutes les communautés : il atterrit
    // sur la première, exactement comme un organisateur sur la sienne.
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/c/${COMMUNITIES[0]!.id}/evenements`),
    )
  })

  it("n'expose aucun parcours d'inscription", async () => {
    renderAt(PATHS.signIn)

    await screen.findByRole('heading', { name: /console de gestion/i })
    expect(screen.queryByRole('link', { name: /créer un compte/i })).toBeNull()
    // Le compte se crée sur le site public, et l'écran le dit.
    expect(screen.getByRole('link', { name: 'lehub.ms' })).toBeTruthy()
  })

  it('atteint la réinitialisation de mot de passe sans session', async () => {
    renderAt(PATHS.resetPassword)

    expect(await screen.findByRole('heading', { name: /mot de passe oublié/i })).toBeTruthy()
  })
})

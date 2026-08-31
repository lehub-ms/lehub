import { useCallback, useEffect, useRef } from 'react'
import { useBlocker } from 'react-router'

/**
 * Prévient avant d'abandonner des modifications non enregistrées.
 *
 * **Deux mécanismes, et il en faut deux.** `useBlocker` arrête une navigation *interne* — le fil
 * d'ariane, la barre latérale, le bouton Annuler — que le navigateur ne voit pas passer, puisque
 * rien ne quitte le document. `beforeunload` arrête ce qui quitte vraiment la page — fermeture
 * de l'onglet, rechargement, adresse tapée à la main — et n'a aucune prise sur la première. L'un
 * sans l'autre laisse la moitié des sorties ouvertes.
 *
 * La confirmation interne est un `window.confirm`. Ce n'est pas l'élégance du reste de
 * l'application, et c'est délibéré : `useBlocker` suspend la navigation de façon synchrone, et
 * la reprendre depuis une boîte de dialogue asynchrone demanderait de porter l'état « une
 * navigation attend » jusque dans le rendu — beaucoup de machinerie pour une question à deux
 * réponses. Le navigateur, lui, la pose déjà correctement au clavier et au lecteur d'écran.
 *
 * `beforeunload` n'affiche pas notre texte : les navigateurs imposent le leur depuis dix ans.
 * Seule compte la présence de l'écouteur, et il n'est posé **que** lorsqu'il y a quelque chose à
 * perdre — un écouteur permanent désactive la restauration instantanée de page dans Safari et
 * Firefox.
 */
export function useUnsavedChanges(dirty: boolean, message: string): () => void {
  /* Doublé par une référence, et ce n'est pas une optimisation. `useBlocker` interroge sa
     condition **au moment de la navigation**, de façon synchrone ; un `setState(false)` suivi
     d'un `navigate()` dans le même tour ne s'est pas encore propagé, et la garde demanderait
     confirmation d'un abandon qui n'en est pas un — c'est exactement ce qui arrivait après un
     enregistrement réussi. La référence, elle, se désarme tout de suite.

     Synchronisée dans un effet et non au rendu : lire ou écrire une référence pendant le rendu
     est interdit, et l'effet suffit — il s'exécute avant tout évènement utilisateur, donc avant
     toute navigation que la frappe précédente aurait armée. */
  const armed = useRef(dirty)

  useEffect(() => {
    armed.current = dirty
  }, [dirty])

  /** Désarme la garde immédiatement : à appeler juste avant la navigation qui suit une
      sauvegarde. Enregistrer n'est pas abandonner. */
  const release = useCallback(() => {
    armed.current = false
  }, [])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      armed.current && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (blocker.state !== 'blocked') return

    if (window.confirm(message)) blocker.proceed()
    else blocker.reset()
  }, [blocker, message])

  useEffect(() => {
    if (!dirty) return

    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
    }
  }, [dirty])

  return release
}

/**
 * Ce que jsdom n'implémente pas et dont la coquille se sert.
 *
 * `ScrollRestoration` de React Router appelle `window.scrollTo` à chaque navigation ; jsdom
 * lève « Not implemented » et noie la sortie des tests sous des lignes qui ne signalent rien.
 * Le site public a le même garde-fou dans son propre `test/setup.ts`.
 */
window.scrollTo = () => {
  /* Rien à restaurer dans un document sans fenêtre de rendu. */
}

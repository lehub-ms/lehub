/**
 * Toutes les URL du backoffice, en un seul endroit.
 *
 * Deux d'entre elles seulement sont atteignables sans session — la connexion et la
 * réinitialisation. `routes.ts` s'appuie sur cette distinction pour placer la garde une fois
 * pour toutes, plutôt que route par route.
 */
export const PATHS = {
  home: '/',
  signIn: '/connexion',
  resetPassword: '/mot-de-passe-oublie',
  noAccess: '/acces-refuse',
} as const

/**
 * L'adresse du site public, d'où l'on vient et où l'on repart : un compte s'y crée, et c'est
 * là qu'on renvoie un compte sans habilitation. Jamais écrite en dur — elle diffère à chaque
 * environnement.
 */
export const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL

if (!PUBLIC_SITE_URL) {
  // Bruyamment au démarrage, comme pour l'origine de l'API : un lien vers « undefined » sur
  // l'écran d'absence d'accès enverrait dans le mur celui qui a le plus besoin d'aide.
  throw new Error(
    'VITE_PUBLIC_SITE_URL is not set. Copy .env.example to .env.local, or check the workflow that builds this app.',
  )
}

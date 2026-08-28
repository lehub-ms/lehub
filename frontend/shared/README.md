# frontend/shared — le socle d'authentification des deux SPA

Le parcours d'authentification est le même sur `lehub.ms` et sur `admin.lehub.ms` : mêmes
routes de relais, mêmes jetons, mêmes messages d'erreur, mêmes champs de formulaire. Il vit
donc ici, importé par les deux applications sous l'alias `@shared`, plutôt qu'en deux copies
dont l'une prendrait du retard sur l'autre au premier correctif.

```
src/
  auth/         session, jetons, parcours de connexion et de réinitialisation
  components/   la carte d'authentification et les champs de formulaire
  lib/          transport HTTP, messages d'erreur, règles de mot de passe, utilitaires
  theme.css     les tokens du design system, importés par les deux index.css
```

**Ce qui ne vit pas ici** : les pages. `SignInPage` et `ResetPasswordPage` dépendent des
`PATHS` de leur application, et leur texte diffère — le backoffice n'a pas de lien « créer un
compte ». Chaque application compose les siennes à partir des hooks et des composants
ci-dessus. `useSignupFlow` reste également côté `lehub.ms` : le backoffice n'expose aucun
parcours d'inscription.

## Ce n'est pas un paquet

Pas de `package.json`, pas de `node_modules`, pas de build. Le dépôt n'a pas de `package.json`
racine (CLAUDE.md), donc pas d'espace de travail npm pour lier trois paquets entre eux ; et un
paquet lié par `file:` installerait sa propre copie de React, ce qui casse les hooks.

Ces sources sont donc compilées par le build de chaque application, et y résolvent leurs
dépendances. Trois réglages, identiques des deux côtés, font tenir cela :

| Où | Quoi | Pourquoi |
|---|---|---|
| `vite.config.ts` | `resolve.alias['@shared']` | l'import `@shared/...` |
| `vite.config.ts` | `resolve.dedupe` | ces sources sont hors de la racine du projet : sans cela le bundler cherche `react` à côté d'elles et ne trouve rien. Garantit aussi un seul React dans le bundle |
| `tsconfig.app.json` | `paths` + `include` | la même résolution pour `tsc`, qui sinon remonte depuis ce répertoire et n'atteint aucun `node_modules` |

La liste de `dedupe` et celle de `paths` sont les dépendances directes du socle. En ajouter une
ici demande de l'ajouter aux deux applications — c'est le prix de l'absence de paquet, et il
est visible.

ESLint, lui, n'atteint pas ce répertoire : il refuse un chemin hors du répertoire de sa
configuration, et lui en donner une supposerait de rendre au socle le `tsconfig.json` et le
`node_modules` qu'on vient de lui retirer. `api/test/sharedFoundation.test.ts` couvre les deux
règles de CLAUDE.md qu'ESLint apportait, sur le texte ; le reste est tenu par les deux
`tsc -b`, `strict` compris.

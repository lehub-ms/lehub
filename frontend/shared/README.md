# frontend/shared — le socle partagé des deux SPA

Le parcours d'authentification est le même sur `lehub.ms` et sur `admin.lehub.ms` : mêmes
routes de relais, mêmes jetons, mêmes messages d'erreur, mêmes champs de formulaire. Il vit
donc ici, importé par les deux applications sous le nom `@lehub/shared`, plutôt qu'en deux
copies dont l'une prendrait du retard sur l'autre au premier correctif.

```
src/
  auth/         session, jetons, parcours de connexion et de réinitialisation
  components/   la carte d'authentification et les champs de formulaire
  lib/          transport HTTP, messages d'erreur, règles de mot de passe, utilitaires
  theme.css     les tokens du design system, importés par les deux index.css
test/           les suites du paquet — voir « Correcteur et tests »
```

**Ce qui ne vit pas ici** : les pages. `SignInPage` et `ResetPasswordPage` dépendent des
`PATHS` de leur application, et leur texte diffère — le backoffice n'a pas de lien « créer un
compte ». Chaque application compose les siennes à partir des hooks et des composants
ci-dessus. `useSignupFlow` reste également côté `lehub.ms` : le backoffice n'expose aucun
parcours d'inscription.

## C'est un paquet npm interne

`@lehub/shared`, privé, jamais publié, consommé par les deux applications en `file:../shared`.
Il n'introduit **aucun** espace de travail npm ni `package.json` racine — la règle du dépôt
tient toujours : le paquet est interne à ce répertoire, et chaque application reste installée
et construite pour elle-même.

Ce qu'il apporte, et que l'alias `@shared` ne pouvait pas donner : une dépendance qui ne sert
qu'au socle est déclarée **ici et nulle part ailleurs**, et ce code est enfin relu par un
correcteur.

### La carte `exports`

```jsonc
"./theme.css": "./src/theme.css",
"./components/AuthCard": "./src/components/AuthCard.tsx",   // … les 8 modules .tsx, nommément
"./*": "./src/*.ts"                                         // tout le reste
```

Une clé littérale l'emporte sur le joker : les huit composants `.tsx` sont donc atteints sans
extension, exactement comme les modules `.ts`. Côté application, un import ne se distingue pas
de ce qu'il était sous l'alias, au préfixe près.

Le prix, visible et assumé : **ajouter un composant `.tsx` au socle demande une ligne dans
`exports`**. Ajouter un module `.ts` n'en demande aucune. Cette ligne est la surface publique
du paquet, écrite là où on la lit.

### Les dépendances

| Où | Quoi | Pourquoi |
|---|---|---|
| `dependencies` | `clsx`, `tailwind-merge`, les deux `@fontsource-variable` | ne servent qu'au socle — déclarées une fois, plus dans les deux applications |
| `peerDependencies` | `react`, `react-dom`, `lucide-react` | fournies par l'application qui consomme le paquet, qui les utilise aussi pour son propre code |
| `devDependencies` | les mêmes, plus l'outillage | le socle en a besoin pour ses propres tests et son correcteur |

**`resolve.dedupe` reste dans les deux `vite.config.ts`, et reste indispensable.** Le paquet
est lié par `file:`, donc résolu à son chemin réel : ses imports partent de
`frontend/shared/node_modules`, où ses dépendances de développement installent un second React.
`dedupe` force `react`, `react-dom` & co à se résoudre depuis la racine de l'application — c'est
la garantie d'un seul React dans le bundle.

### L'ordre d'installation, qui n'est pas négociable

Installer une application ne peuple **pas** le `node_modules` du paquet qu'elle lie : son
lockfile enregistre le manifeste du socle sans en installer les dépendances. Or le socle résout
ses propres imports depuis son chemin réel — dont les deux `@import '@fontsource-variable/…'` de
`theme.css`, qui ne sont plus déclarés ailleurs.

`frontend/shared` s'installe donc **avant** les deux applications, et c'est écrit à chacun des
trois endroits qui installent : `scripts/dev-up.sh`, `.github/workflows/ci.yml` et le job `web`
de `.github/workflows/cd.yml`.

### La directive `@source` de `theme.css`

Tailwind v4 ne scanne que la racine du projet qui compile, et ce répertoire est en dehors —
il est même atteint à travers `node_modules`, que Tailwind ignore par défaut. `@source '.'`
reste donc dans `theme.css`, où elle décrit le socle plutôt que ses consommateurs.

Son absence ne casse rien de visible : pas d'erreur, pas d'avertissement, un build vert, et
toute classe utilisée par un composant du socle et par lui seul disparue des deux feuilles.
C'est ce qui a vidé les deux écrans d'authentification de leurs styles de champ.
`test/tailwindSource.test.ts` la surveille.

### Correcteur et tests

```bash
npm --prefix frontend/shared run lint    # eslint — mêmes règles que les deux applications
npm --prefix frontend/shared run build   # tsc -b — vérification de types, sans émission
npm --prefix frontend/shared test        # vitest
```

La configuration ESLint est la copie conforme de celle des applications, `react-hooks` et
`recommendedTypeChecked` compris : c'est ce que le montage précédent rendait impossible, et
c'est ce qui a motivé le passage au paquet. `frontend/shared` figure dans la matrice
d'intégration continue au même titre que les trois autres projets — `npm audit` bloquant en
`high` inclus.

Trois projets TypeScript, sur le patron de `/api` : `tsconfig.app.json` pour `src/` (types
navigateur), `tsconfig.test.json` pour `test/` (qui ajoute les types Node, parce que la garde
`@source` lit la feuille sur le disque), `tsconfig.node.json` pour `vitest.config.ts`.

## Une frontière conservée : `react-router`

Rien ici ne navigue. `ResetPasswordPage` reçoit son lien de retour déjà rendu et un rappel de
fin de parcours, et chaque application y met ses propres routes.

Cette frontière était d'abord une contrainte technique — `paths` ne savait pas suivre un paquet
qui ne publie que des `exports` — et le paquet la lèverait aujourd'hui. Elle est gardée parce
qu'elle s'est trouvée être la bonne : un composant du socle n'a pas à connaître les URL de qui
l'utilise.

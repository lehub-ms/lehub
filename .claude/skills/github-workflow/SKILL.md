---
name: github-workflow
description: Git/GitHub workflow for lehub-ms/lehub — branch creation from an issue, commits, pull request to develop, PR review, merge, GitHub Project status transitions (Todo → In Progress → In Review → In Test → Validated → Done), release PR from develop to main, hotfix branches, and the CD deployment consequences. Use whenever the user mentions une branche, une issue, une PR / pull request, un merge, une release, un déploiement, develop, main, or un hotfix.
---

# LeHub — Git & GitHub workflow

Ce skill fait autorité sur les branches, les commits, les PR, les statuts et les releases.
Voir le skill `lehub-spec` pour créer les issues elles-mêmes, et CLAUDE.md pour la hiérarchie
et le format des issues.

`main` = branche par défaut → CD automatique vers l'infra Azure **Prod**.
`develop` = branche d'intégration → CD automatique vers l'infra Azure **Dev**.
Hiérarchie : `Feature` (parent) > `Story` / `Bug` (sub-issues).

**Principe directeur : une issue ouverte = pas encore en production.**

**Unité de livraison = la Feature.** Une Feature → une branche → une PR, regroupant ses
Stories et ses Bugs, un commit par sub-issue. Même un seul `Bug` isolé se livre sous sa
Feature parente : la branche porte le **numéro de la Feature** et le **slug du bug**.

## Cycle de vie

### 1. Pars d'une issue rattachée à une Feature

Ne commence aucun travail sans issue. Si elle n'existe pas, crée-la via `lehub-spec` avec sa
Feature parente. Récupère la Feature et ses sub-issues — c'est le lot de la branche :

```bash
gh issue view <n> --repo lehub-ms/lehub --json number,title,state,parent
gh api graphql -f query='
query($owner:String!,$name:String!,$num:Int!) {
  repository(owner:$owner, name:$name) {
    issue(number:$num) { subIssues(first:30){ nodes{ number title issueType{name} } } }
  }
}' -F owner="lehub-ms" -F name="lehub" -F num=<numéro-feature>
```

### 2. Crée la branche **depuis la Feature**

Toujours via `gh issue develop`, jamais `git checkout -b` seul : c'est ce qui crée le lien
*Development* entre l'issue et la branche.

```bash
gh issue develop <numéro-feature> --repo lehub-ms/lehub --base develop \
  --name feat/<numéro-feature>-<slug-court> --checkout
```

Nommage : `feat/<numéro-feature>-<slug-court>`, ou `fix/<numéro-feature>-<slug-du-bug>` quand
le lot ne contient qu'un `Bug`. Toujours basée sur `develop`.

Passe la Feature et ses sub-issues en **In Progress**.

### 3. Développe et commite

Commits conventionnels, sujet en anglais, `Refs #<sub-issue>` dans le corps, DCO obligatoire.
Un commit par Story / Bug, ordonnés selon leurs dépendances réelles :

```bash
git commit -s -m "feat(api): add technology filter to /api/events" -m "Refs #43"
```

### 4. Ouvre la PR vers `develop`

```bash
git push -u origin HEAD
gh pr create --repo lehub-ms/lehub --base develop \
  --title "feat(api): filtre par technologie" \
  --body "Refs #42
Refs #43
Refs #44

<résumé des changements>"
```

Le corps porte une ligne `Refs #<n>` pour la **Feature et chacune de ses sub-issues livrées** :
c'est ce que la PR de release moissonnera. **Jamais `Closes` / `Fixes`** — voir « Erreurs
fréquentes ».

Passe le lot en **In Review**.

### 5. Merge sur `develop`

```bash
gh pr checks --repo lehub-ms/lehub          # CI verte obligatoire
gh pr merge <pr> --repo lehub-ms/lehub --squash --delete-branch
```

Le CD dev part. Déploiement dev OK → passe le lot en **In Test**. **Les issues restent
ouvertes.**

### 6. Validation métier

Recette OK → **Validated**. Le lot est prêt pour la prod.

### 7. Release `develop` → `main`

Voir « PR de release ». Au merge : les issues se ferment automatiquement, l'automation du
Project les bascule en **Done**, le CD prod part.

## Statuts du GitHub Project

Le suivi se fait dans le GitHub Project de l'organisation `lehub-ms` (champ `Status`). Toute
issue de travail y figure ; la Feature et ses sub-issues avancent **ensemble**, puisqu'elles
sont livrées par la même PR.

| Statut | Déclencheur |
|---|---|
| `Todo` | statut par défaut à la création ; issue affinée, prête à être prise |
| `In Progress` | branche créée |
| `In Review` | PR ouverte vers `develop` |
| `In Test` | PR mergée sur `develop`, CD dev OK, en attente de validation |
| `Validated` | recette OK, prête pour la prod |
| `Done` | mergée sur `main`, CD prod OK, issue fermée |

### Mettre à jour le statut

Prérequis : `gh auth refresh -s project` (le scope `project` n'est pas dans le token par
défaut ; sans lui toutes les commandes ci-dessous échouent en `INSUFFICIENT_SCOPES`).

Résous les identifiants une fois par session — ce ne sont pas des flags `gh` classiques :

```bash
# 1. numéro et ID du Project
gh project list --owner lehub-ms --format json

# 2. ID du champ Status et de ses options
gh project field-list <project-number> --owner lehub-ms --format json \
  --jq '.fields[] | select(.name=="Status") | {id, options}'

# 3. ID de l'item correspondant à l'issue
gh project item-list <project-number> --owner lehub-ms --format json --limit 200 \
  --jq '.items[] | select(.content.number==<n>) | {id, title}'
```

Puis écris le statut, pour chaque issue du lot :

```bash
gh project item-edit --id <item-id> --project-id <project-id> \
  --field-id <status-field-id> --single-select-option-id <option-id>
```

Si l'issue n'est pas encore dans le Project :

```bash
gh project item-add <project-number> --owner lehub-ms \
  --url https://github.com/lehub-ms/lehub/issues/<n>
```

## PR de release

Titre : `Release YYYY.MM.DD`.
Corps : une ligne `Closes #<n>` par issue du lot — Features **et** sub-issues, une sub-issue ne
se fermant pas avec son parent — plus un résumé des changements.

Génère la liste des issues du lot :

```bash
gh pr list --state merged --base develop --json body \
  --jq '.[].body' | grep -oiE 'refs #[0-9]+' | grep -oE '[0-9]+' | sort -u \
  | sed 's/^/Closes #/'
```

Restreins le résultat aux PR mergées **depuis la dernière release** (`gh release list`, ou le
dernier merge `develop` → `main`), puis ouvre la PR :

```bash
gh pr create --repo lehub-ms/lehub --base main --head develop \
  --title "Release $(date +%Y.%m.%d)" --body-file <fichier>
```

Au merge : fermeture automatique des issues, bascule en `Done`, CD prod.

## Hotfix

```bash
git fetch origin && git checkout -b hotfix/<n>-<slug> origin/main
# ... correctif, commits signés ...
git push -u origin HEAD
gh pr create --repo lehub-ms/lehub --base main \
  --title "fix(scope): ..." --body "Closes #<n>"
```

`Closes` fonctionne ici parce que la PR cible `main`, la branche par défaut.

**Merge retour obligatoire, dans la même session de travail :**

```bash
gh pr merge <pr> --repo lehub-ms/lehub --squash --delete-branch
git checkout develop && git pull
git merge origin/main && git push
```

Si le merge retour est bloqué par la protection de branche, ouvre immédiatement une PR
`main` → `develop` et signale-la à l'utilisateur.

## Erreurs fréquentes

- **`Closes #<n>` dans une PR vers `develop`** — GitHub n'applique les mots-clés de fermeture
  que lorsque la PR cible la **branche par défaut** du dépôt (`main`). Sur une PR vers
  `develop`, `Closes` / `Fixes` / `Resolves` est purement décoratif : l'issue ne se fermera
  jamais, mais tout le monde croira qu'elle est gérée. Écris `Refs #<n>` — la fermeture est le
  travail de la PR de release.
- **Ne référencer que la Feature dans la PR** — les sub-issues absentes du corps ne seront pas
  moissonnées par la PR de release, donc jamais fermées.
- **Fermer l'issue à la main après le merge sur `develop`** — l'issue ouverte est le signal
  « pas encore en prod ». La fermer casse la génération de la PR de release et le suivi.
- **`git checkout -b` au lieu de `gh issue develop`** — pas de lien *Development*, donc pas de
  traçabilité issue ↔ branche.
- **Oublier le `-s`** — chaque commit doit porter son `Signed-off-by` (DCO).
- **Oublier de faire avancer le statut** — `In Test` après le CD dev et `Validated` après la
  recette ne sont déclenchés par aucune automation : c'est à toi de les positionner.

## Interdits

- Push direct sur `main` ou `develop`.
- Cherry-pick de `develop` vers `main` : `develop` part toujours en entier.
- `Closes` / `Fixes` dans une PR qui ne cible pas `main`.
- Fermer une issue manuellement avant le déploiement prod.
- Ouvrir une PR vers `main` depuis autre chose que `develop` ou une branche `hotfix/*`.
- Laisser un hotfix sans son merge retour dans `develop`.
- Batcher deux Features dans une même PR.

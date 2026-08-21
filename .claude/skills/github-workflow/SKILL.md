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

Toujours via `gh issue develop`, jamais `git checkout -b` seul, **dans les deux modes** ci-dessous :
c'est `gh issue develop` qui crée le lien *Development* entre l'issue et la branche, pas
l'existence d'une branche locale.

Nommage : `feat/<numéro-feature>-<slug-court>`, ou `fix/<numéro-feature>-<slug-du-bug>` quand
le lot ne contient qu'un `Bug`. Toujours basée sur `develop` (sauf hotfix, voir plus bas).

**Le choix worktree vs checkout classique n'est jamais silencieux.** Dès que la création d'une
branche est engagée, propose explicitement les deux options et attends une confirmation de
l'utilisateur (`AskUserQuestion` ou équivalent conversationnel) avant d'exécuter `gh issue
develop`. Ne décide jamais seul à sa place.

#### Mode checkout classique

Bascule le clone courant sur la nouvelle branche — un seul chantier actif à la fois dans ce clone :

```bash
gh issue develop <numéro-feature> --repo lehub-ms/lehub --base develop \
  --name feat/<numéro-feature>-<slug-court> --checkout
```

#### Mode worktree

Pour avancer sur plusieurs Features en parallèle sans changer de branche dans le clone courant.
`gh issue develop` s'utilise **sans** `--checkout` : la branche est créée côté GitHub, le clone
courant ne bouge pas.

```bash
gh issue develop <numéro-feature> --repo lehub-ms/lehub --base develop \
  --name feat/<numéro-feature>-<slug-court>
git fetch origin
git worktree add ../lehub.worktrees/<slug-branche> <nom-de-branche>
code ../lehub.worktrees/<slug-branche>          # ou : open -a "Visual Studio Code" <chemin> (macOS, si `code` absent du PATH)
```

- Répertoire cible : frère du clone, **hors du dépôt versionné**
  (`../lehub.worktrees/<slug-branche>/`) — jamais à la racine du dépôt, CLAUDE.md interdit tout
  nouveau répertoire racine sans discussion préalable avec le mainteneur.
- `<slug-branche>` = nom de la branche avec les `/` remplacés par des `-`
  (`feat/42-technology-filter` → `feat-42-technology-filter`), pour rester identifiable entre
  plusieurs fenêtres VS Code ouvertes en parallèle.
- Chaque worktree est un checkout indépendant : `./scripts/dev-up.sh` et `./scripts/dev-start.sh`
  doivent être relancés dedans (dépendances et env propres à chaque répertoire).
- Plusieurs Features "In Progress" en parallèle via des worktrees distincts est un état normal du
  Project — pas une anomalie.

Passe la Feature et ses sub-issues en **In Progress**, dans les deux modes.

### 3. Développe et commite

Commits conventionnels, sujet en anglais, `Refs #<sub-issue>` dans le corps, DCO obligatoire.
Un commit par Story / Bug, ordonnés selon leurs dépendances réelles :

```bash
git commit -s -m "feat(api): add technology filter to /api/events" -m "Refs #43"
```

#### Rebase régulier (branches en worktree)

`develop` continue d'avancer pendant qu'un worktree existe (d'autres Features mergées en
parallèle). Toute branche `feat/*` ou `fix/*` en worktree doit être rebasée régulièrement sur
`origin/develop`, exécuté dans le worktree concerné :

```bash
git fetch origin
git rebase origin/develop
```

Au minimum avant l'ouverture de la PR ; recommandé aussi à chaque reprise de session sur une
Feature de longue durée. Les branches `hotfix/*` en sont exclues — elles partent de `main`, pas
de `develop`, et suivent leur propre cycle (section « Hotfix ») ; elles suivent en revanche la
même logique de worktree.

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

Si la branche a été développée en worktree, supprime-le dans la foulée (no-op en mode checkout
classique) :

```bash
git worktree remove ../lehub.worktrees/<slug-branche>
git worktree prune
```

Le CD dev part. Déploiement dev OK → passe le lot en **In Test**. **Les issues restent
ouvertes.**

#### Nettoyage des worktrees orphelins

Le nettoyage ci-dessus suppose que le merge passe par `gh pr merge --delete-branch` dans cette
session. Une PR peut aussi être mergée ailleurs — portail GitHub web, extension VS Code GitHub
Pull Requests, un autre contributeur : la branche distante disparaît, mais ni la branche locale
ni le worktree ne sont nettoyés automatiquement.

Détecte-les périodiquement, pas seulement en réaction à un cas constaté :

```bash
git fetch --prune
git branch -vv          # une branche avec ": gone]" a été supprimée côté remote
git worktree list       # retrouve le chemin du worktree associé
```

Puis nettoie :

```bash
git worktree remove ../lehub.worktrees/<slug-branche>
git branch -d <nom-de-branche>
git worktree prune
```

Ce cas est distinct de l'abandon d'une Feature (issue fermée sans merge, voir « Edge cases » plus
bas) : ici la Feature a bien été livrée, seul le nettoyage local a été sauté.

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

Prérequis : `gh auth refresh -h github.com -s project` (le scope `project` n'est pas dans le
token par défaut ; sans lui toutes les commandes ci-dessous échouent en `INSUFFICIENT_SCOPES`).
Le flux device-code exige un vrai TTY : à lancer dans un terminal, pas via `!` dans Claude Code.

Le Project est **`LeHub.ms`, numéro 4** sur l'organisation `lehub-ms`
(`PVT_kwDOEpAVBs4Bguvh`). Résous les IDs en début de session — ils changent dès qu'on touche
au champ, ne les code jamais en dur :

```bash
# ID du champ Status et de ses options
gh project field-list 4 --owner lehub-ms --format json \
  --jq '.fields[] | select(.name=="Status") | {id, options}'

# ID de l'item correspondant à l'issue
gh project item-list 4 --owner lehub-ms --format json --limit 200 \
  --jq '.items[] | select(.content.number==<n>) | {id, title}'
```

⚠️ **Ne touche jamais aux options du champ `Status` sans sauvegarde.** La mutation
`updateProjectV2Field(singleSelectOptions:)` ne fusionne pas par nom : elle **recrée toutes les
options avec de nouveaux IDs et vide le statut de tous les items du Project**. Si c'est
inévitable, dumpe `gh project item-list 4 --owner lehub-ms --format json --limit 100` avant, et
rejoue les statuts après.

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

Le choix worktree vs checkout classique se pose ici aussi (même confirmation explicite qu'en
§2) : en mode worktree, remplace le `git checkout -b ... origin/main` ci-dessus par
`git worktree add ../lehub.worktrees/hotfix-<n>-<slug> -b hotfix/<n>-<slug> origin/main`, puis
ouvre VS Code dessus. Un hotfix en worktree n'a pas besoin de rebase régulier — il part de
`main`, pas de `develop`, et vit le temps du correctif.

**Merge retour obligatoire, dans la même session de travail :**

```bash
gh pr merge <pr> --repo lehub-ms/lehub --squash --delete-branch
git checkout develop && git pull
git merge origin/main && git push
```

Si le hotfix a été développé en worktree, supprime-le après le merge retour :

```bash
git worktree remove ../lehub.worktrees/hotfix-<n>-<slug>
git worktree prune
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
- **Oublier `git worktree remove` après un merge** — le worktree traîne sur le disque, orphelin ;
  voir « Nettoyage des worktrees orphelins » pour le repérer après coup.
- **Créer un worktree à l'intérieur du dépôt versionné** — viole l'interdiction CLAUDE.md sur
  tout nouveau répertoire racine, et pollue le `git status` du clone principal.
- **Laisser un worktree diverger de `develop` sans rebase avant la PR** — les conflits
  s'accumulent et éclatent tous au moment du merge au lieu d'être résolus au fil de l'eau.

## Edge cases (worktree)

- Une branche déjà checkoutée dans le clone principal ne peut pas être ajoutée en worktree
  ailleurs sans être d'abord libérée (bascule le clone principal sur une autre branche) —
  `git worktree add` échoue sinon avec une erreur explicite.
- Un conflit de rebase sur `origin/develop` se résout dans le worktree concerné ; l'isolation du
  worktree confine le conflit à cette Feature, sans affecter les autres worktrees ouverts en
  parallèle.
- Un hotfix suit la même logique de worktree que `feat/*` (choix proposé, `git worktree add`),
  hors obligation de rebase — voir section « Hotfix ».
- Une Feature en worktree dont l'issue est fermée sans merge (abandon) laisse un worktree
  orphelin non couvert par le flux post-merge automatique — nettoyage manuel
  (`git worktree remove` + `git worktree prune`) à la charge du contributeur.

## Interdits

- Push direct sur `main` ou `develop`.
- Cherry-pick de `develop` vers `main` : `develop` part toujours en entier.
- `Closes` / `Fixes` dans une PR qui ne cible pas `main`.
- Fermer une issue manuellement avant le déploiement prod.
- Ouvrir une PR vers `main` depuis autre chose que `develop` ou une branche `hotfix/*`.
- Laisser un hotfix sans son merge retour dans `develop`.
- Batcher deux Features dans une même PR.
- Créer un worktree à la racine du dépôt ou ailleurs que dans `../lehub.worktrees/`.

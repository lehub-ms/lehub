---
name: lehub-spec
description: Create or amend a lehub-ms/lehub GitHub issue of type Epic, Feature, Story, or Bug — sets the correct native Issue Type, parent sub-issue, title prefix, and `qualified` label, and drafts the body in the type-specific French template from CLAUDE.md. Use when the user wants to "spécifier" something, "amender une spec", or create/edit an Epic, Feature, Story, or Bug for LeHub.
---

# LeHub — Specs & Bugs

Operational recipe for `lehub-ms/lehub` issues. **CLAUDE.md → "GitHub Issues" is the source of
truth** for the hierarchy, prefixes, the `qualified` label, and the per-type body templates —
read it before drafting anything. This skill only covers the *how*, because none of it is a
plain `gh issue create` flag: native Issue Type and sub-issue parent are GraphQL-only.

## 1. Determine the type

From what the user says. If ambiguous, ask — don't guess between Feature and Story.

## 2. Determine the parent, then challenge it

- `Epic` → none.
- `Feature` → an `Epic` (ask if not given).
- `Story` / `Bug` → a `Feature` (ask if not given).

Never trust a guessed parent number — validate it:

```bash
gh api graphql -f query='
query($owner:String!,$name:String!,$num:Int!) {
  repository(owner:$owner, name:$name) { issue(number:$num) { title issueType { name } } }
}' -F owner="lehub-ms" -F name="lehub" -F num=<parent-number>
```

Stop and tell the user if the parent's `issueType.name` isn't the required one
(`Epic` for a `Feature`'s parent, `Feature` for a `Story`/`Bug`'s parent).

**Then always challenge the placement out loud** — whether the user proposed it or not, and
even when it turns out to be correct. Never skip straight to drafting. This includes a new
`Epic`: they're meant to stay very few (CLAUDE.md), so pull `gh issue list --search
type:Epic --json number,title,body` first and check the spec isn't actually a `Feature` under
an existing Epic before agreeing it deserves a new top-level one.

1. Pull the siblings for context:
   ```bash
   gh api graphql -f query='
   query($owner:String!,$name:String!,$num:Int!) {
     repository(owner:$owner, name:$name) {
       issue(number:$num) { subIssues(first: 30) { nodes { number title issueType { name } body } } }
     }
   }' -F owner="lehub-ms" -F name="lehub" -F num=<epic-or-feature-number>
   ```
   For a `Feature`'s siblings, pull the parent `Epic`'s `subIssues` (other Features) to check
   for scope overlap with a *different* Feature. For a `Story`/`Bug`, pull the target
   `Feature`'s `subIssues` (its existing Stories) to check overlap and sizing.

2. Reason explicitly against what the spec actually describes, and say so before continuing:
   - **New Feature vs. existing Feature**: does the spec's functional scope already fit inside
     an existing sibling Feature's `Contexte`/`Comportement attendu`, or under a *different*
     Feature than proposed? If it overlaps > incidentally with an existing Feature, say so and
     propose adding Stories there instead of a new Feature.
   - **One Story vs. split into N**: does the spec describe a single testable behavior, or
     several independent "en tant que... je veux..." threads / several distinct acceptance
     criteria groups that don't share one flow? If it's several, propose the split — one Story
     per independent behavior — rather than one oversized Story.
   - **Right Epic**: for a Feature, does the target Epic's `Objectif`/`Valeur` actually cover
     this, or does another Epic fit better?
   State the reasoning in 2-4 sentences (siblings checked, why it fits or doesn't), give your
   recommendation, and get the user's explicit go/adjust before moving to drafting — even a
   quiet "oui c'est bon" counts, but don't proceed silently.

## 3. Draft — do not create yet

Build the title and body per CLAUDE.md's per-type template:

| Type | Title | Body |
|---|---|---|
| Epic | `👑 <title>` | Objectif / Valeur / Périmètre (Inclus, Exclu) |
| Feature | `🚀 <title>` | Contexte / Comportement attendu |
| Story | `<title>` (no prefix) | "En tant que..., je veux..., afin de..." + behavior/business rules + Critères d'acceptation + Edge cases |
| Bug | `<title>` (no prefix) | bug / écran / comportement constaté vs. attendu / étapes de reproduction |

If step 2's challenge led to a split (N Stories) or to creating a Feature plus its Stories,
draft **all of them now**, as one batch — never draft-confirm-create one at a time.

## 4. Confirm exactly what will be created — mandatory gate, no exceptions

Before running a single `gh` command, present the user a complete, per-issue summary of every
issue about to be created, in creation order (parents before their children), each with:

- **Titre** (with prefix if any)
- **Type** (Epic / Feature / Story / Bug)
- **Parent** (`#N — <title>`, or "aucun" for an Epic)
- **Label** `qualified` — oui/non
- the **full body**, exactly as it will be posted (not a summary of it)

For a batch (N Stories, or a Feature + its Stories), show the whole batch in this one message —
the user approves or amends the set as a whole, not issue by issue. Stop and wait. Do not call
`gh issue create` for anything, even the first item, until the user gives explicit go-ahead on
this exact presented content. If they ask for changes, redraft and present the updated version
again before proceeding — creating a GitHub issue is a visible, shared-state action, never
fire-and-forget, and this applies identically whether it's one issue or several.

## 5. Create

Only after step 4's confirmation, create each issue in the confirmed order — parents first, so
a new Feature's number exists before its Stories are created and parented to it:

```bash
gh issue create --title "<title>" --body-file <tmpfile> \
  --repo lehub-ms/lehub \
  $( [ "$TYPE" != "Bug" ] && echo --label qualified )
```

`Epic`/`Feature`/`Story` get `--label qualified`; `Bug` never does. Capture each returned issue
number as you go — later items in the batch (e.g. Stories under a Feature just created) need it.

## 6. Set native type + parent

```bash
.claude/skills/lehub-spec/scripts/set-issue-hierarchy.sh <issue-number> <Epic|Feature|Story|Bug> [parent-number]
```

Resolves the repo's issue-type and node IDs at call time (they are not hardcoded), then calls
`updateIssue(issueTypeId:...)` and, if a parent was given, `addSubIssue(issueId:parent,
subIssueId:child)`.

## 7. Confirm

Report each created issue's URL, type, parent, and whether `qualified` was applied.

## Amending an existing spec

"Amende la spec de #N" / "amende la Feature #N" → fetch current state first:

```bash
gh api graphql -f query='
query($owner:String!,$name:String!,$num:Int!) {
  repository(owner:$owner, name:$name) {
    issue(number:$num) { title body issueType { name } parent { number title } }
  }
}' -F owner="lehub-ms" -F name="lehub" -F num=<N>
```

Draft the change against the same per-type template, show a diff-style preview, confirm, then:

```bash
gh issue edit <N> --repo lehub-ms/lehub --title "..." --body-file <tmpfile>
```

Type and parent don't normally change on an amend — only re-run step 6 if the user explicitly
asks to re-type or re-parent the issue.

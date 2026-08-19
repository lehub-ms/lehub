#!/usr/bin/env bash
# Sets the native GitHub Issue Type and (optionally) the parent sub-issue link on a
# lehub-ms/lehub issue. `gh issue create`/`edit` have no flag for either — both are
# GraphQL-only (updateIssue.issueTypeId, addSubIssue). Type IDs are resolved by name at
# runtime rather than hardcoded, since they are per-repo IDs.
set -euo pipefail

REPO_OWNER="lehub-ms"
REPO_NAME="lehub"

usage() {
  echo "Usage: $0 <issue-number> <Epic|Feature|Story|Bug|Task> [parent-issue-number]" >&2
  exit 1
}

[ $# -ge 2 ] || usage
ISSUE_NUM="$1"
TYPE_NAME="$2"
PARENT_NUM="${3:-}"

# A missing issue is not an error for GitHub: it answers 200 with issue == null, and
# jq then prints the string "null". Both emptiness and that literal must be rejected,
# otherwise the mutations below run with id:"null" and fail with a raw GraphQL error.
issue_node_id() {
  gh api graphql -f query='
    query($owner:String!,$name:String!,$num:Int!) {
      repository(owner:$owner, name:$name) { issue(number:$num) { id } }
    }' -F owner="$REPO_OWNER" -F name="$REPO_NAME" -F num="$1" \
    --jq '.data.repository.issue.id // empty'
}

ISSUE_ID=$(issue_node_id "$ISSUE_NUM")
[ -n "$ISSUE_ID" ] && [ "$ISSUE_ID" != null ] || { echo "Issue #$ISSUE_NUM not found" >&2; exit 1; }

TYPE_ID=$(gh api graphql -f query='
  query($owner:String!,$name:String!) {
    repository(owner:$owner, name:$name) {
      issueTypes(first:20) { nodes { id name } }
    }
  }' -F owner="$REPO_OWNER" -F name="$REPO_NAME" \
  --jq ".data.repository.issueTypes.nodes[] | select(.name==\"$TYPE_NAME\") | .id")
[ -n "$TYPE_ID" ] || { echo "Issue type '$TYPE_NAME' not found in $REPO_OWNER/$REPO_NAME" >&2; exit 1; }

gh api graphql -f query='
  mutation($issueId:ID!, $typeId:ID!) {
    updateIssue(input:{id:$issueId, issueTypeId:$typeId}) { issue { id } }
  }' -F issueId="$ISSUE_ID" -F typeId="$TYPE_ID" >/dev/null
echo "#$ISSUE_NUM -> type $TYPE_NAME"

if [ -n "$PARENT_NUM" ]; then
  PARENT_ID=$(issue_node_id "$PARENT_NUM")
  [ -n "$PARENT_ID" ] && [ "$PARENT_ID" != null ] || { echo "Parent issue #$PARENT_NUM not found" >&2; exit 1; }

  gh api graphql -f query='
    mutation($parentId:ID!, $childId:ID!) {
      addSubIssue(input:{issueId:$parentId, subIssueId:$childId}) { issue { id } }
    }' -F parentId="$PARENT_ID" -F childId="$ISSUE_ID" >/dev/null
  echo "#$ISSUE_NUM -> parent #$PARENT_NUM"
fi

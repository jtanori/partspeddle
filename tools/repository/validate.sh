#!/bin/bash
# capability: repository.validate
# reads: .git/, project-governance/runtime/state/
# writes: nothing
# timeout: 10s

set -euo pipefail

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
BRANCH=$(git branch --show-current 2>/dev/null || echo "DETACHED")
HEAD_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "UNKNOWN")
DIRTY_COUNT=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
DETACHED=$(git symbolic-ref --short HEAD 2>/dev/null >/dev/null && echo "false" || echo "true")

# Load active ticket for branch matching
TICKET="NONE"
if [ -f "project-governance/runtime/state/current-ticket.json" ]; then
  TICKET=$(cat "project-governance/runtime/state/current-ticket.json" | node -e '
    const d = require("fs").readFileSync(0, "utf-8");
    const j = JSON.parse(d);
    console.log(j.last_ticket?.id || j.ticket?.id || "NONE");
  ' 2>/dev/null || echo "NONE")
fi

# Branch matching check
BRANCH_MATCH="false"
if [ "$TICKET" != "NONE" ] && echo "$BRANCH" | grep -q "$TICKET"; then
  BRANCH_MATCH="true"
fi

# Determine status
STATUS="PASS"
ERRORS=()
WARNINGS=()

if [ "$DIRTY_COUNT" -gt 0 ]; then
  STATUS="FAIL"
  ERRORS+=("Worktree dirty: $DIRTY_COUNT uncommitted changes")
fi

if [ "$DETACHED" = "true" ]; then
  STATUS="FAIL"
  ERRORS+=("Detached HEAD")
fi

if [ "$BRANCH_MATCH" = "false" ] && [ "$TICKET" != "NONE" ]; then
  WARNINGS+=("Branch '$BRANCH' does not contain ticket '$TICKET'")
fi

# Build JSON
ERRORS_JSON=$(printf '%s\n' "${ERRORS[@]}" | sed 's/^/    "/; s/$/"/; $!s/$/,/' | paste -sd '\n' -)
WARNINGS_JSON=$(printf '%s\n' "${WARNINGS[@]}" | sed 's/^/    "/; s/$/"/; $!s/$/,/' | paste -sd '\n' -)

cat <<EOF
{
  "capability": "repository.validate",
  "status": "$STATUS",
  "timestamp": "$TS",
  "summary": "Repository $STATUS: $DIRTY_COUNT uncommitted, branch $BRANCH",
  "data": {
    "branch": "$BRANCH",
    "head_commit": "$HEAD_COMMIT",
    "dirty_count": $DIRTY_COUNT,
    "detached_head": $DETACHED,
    "branch_matches_ticket": $BRANCH_MATCH,
    "active_ticket": "$TICKET"
  },
  "warnings": [$(if [ ${#WARNINGS[@]} -gt 0 ]; then echo; echo "$WARNINGS_JSON"; echo "  "; fi)],
  "errors": [$(if [ ${#ERRORS[@]} -gt 0 ]; then echo; echo "$ERRORS_JSON"; echo "  "; fi)],
  "metrics": {},
  "next_actions": [$(if [ "$STATUS" = "FAIL" ]; then echo '"git status"'; else echo; fi)]
}
EOF

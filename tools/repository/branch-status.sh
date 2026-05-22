#!/bin/bash
# capability: repository.branch
# reads: .git/
# writes: nothing
# timeout: 5s

set -euo pipefail

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
BRANCH=$(git branch --show-current 2>/dev/null || echo "DETACHED")
HEAD=$(git rev-parse HEAD 2>/dev/null || echo "UNKNOWN")
SHORT_HEAD=$(git rev-parse --short HEAD 2>/dev/null || echo "UNKNOWN")
BASE=$(git merge-base HEAD develop 2>/dev/null || git merge-base HEAD main 2>/dev/null || echo "UNKNOWN")
COMMITS_AHEAD=$(git rev-list --count "$BASE..HEAD" 2>/dev/null || echo 0)
COMMITS_BEHIND=$(git rev-list --count "HEAD..$BASE" 2>/dev/null || echo 0)

cat <<EOF
{
  "capability": "repository.branch",
  "status": "PASS",
  "timestamp": "$TS",
  "summary": "Branch $BRANCH: $COMMITS_AHEAD ahead, $COMMITS_BEHIND behind base",
  "data": {
    "branch": "$BRANCH",
    "head_commit": "$HEAD",
    "short_head": "$SHORT_HEAD",
    "base_commit": "$BASE",
    "commits_ahead": $COMMITS_AHEAD,
    "commits_behind": $COMMITS_BEHIND
  },
  "warnings": [],
  "errors": [],
  "metrics": {},
  "next_actions": []
}
EOF

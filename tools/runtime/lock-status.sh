#!/bin/bash
# capability: runtime.lock
# reads: project-governance/runtime/state/execution-lock.json
# writes: nothing
# timeout: 5s

set -euo pipefail

LOCK_FILE="project-governance/runtime/state/execution-lock.json"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [ ! -f "$LOCK_FILE" ]; then
  echo '{"capability":"runtime.lock","status":"FAIL","timestamp":"'"$TS"'","summary":"Lock file missing","data":null,"warnings":[],"errors":["execution-lock.json not found"],"metrics":{},"next_actions":["runtime.audit"]}'
  exit 1
fi

LOCK=$(cat "$LOCK_FILE")

cat <<EOF
{
  "capability": "runtime.lock",
  "status": "PASS",
  "timestamp": "$TS",
  "summary": "Lock state retrieved",
  "data": $LOCK,
  "warnings": [],
  "errors": [],
  "metrics": {},
  "next_actions": []
}
EOF

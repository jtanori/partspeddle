#!/bin/bash
# capability: runtime.status
# reads: project-governance/runtime/state/*
# writes: nothing
# timeout: 5s

set -euo pipefail

STATE_DIR="project-governance/runtime/state"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [ ! -f "$STATE_DIR/active-execution.json" ]; then
  echo '{"capability":"runtime.status","status":"FAIL","timestamp":"'"$TS"'","summary":"active-execution.json missing","data":null,"warnings":[],"errors":["Canonical state file not found"],"metrics":{},"next_actions":["runtime.audit"]}'
  exit 1
fi

RUNTIME=$(cat "$STATE_DIR/active-execution.json")
LOCK=$(cat "$STATE_DIR/execution-lock.json" 2>/dev/null || echo '{"locked":false}')
TICKET=$(cat "$STATE_DIR/current-ticket.json" 2>/dev/null || echo '{"active":false}')
MILESTONE=$(cat "$STATE_DIR/current-milestone.json" 2>/dev/null || echo '{}')

STATUS=$(echo "$RUNTIME" | node -e 'const d=require("fs").readFileSync(0,"utf-8"); const j=JSON.parse(d); console.log(j.runtime_status || "UNKNOWN");')
CONFIDENCE=$(echo "$RUNTIME" | node -e 'const d=require("fs").readFileSync(0,"utf-8"); const j=JSON.parse(d); console.log(j.runtime_confidence?.score ?? 0);')
DRIFT=$(echo "$RUNTIME" | node -e 'const d=require("fs").readFileSync(0,"utf-8"); const j=JSON.parse(d); console.log(j.drift_risk?.level || "UNKNOWN");')
LAST_TASK=$(echo "$RUNTIME" | node -e 'const d=require("fs").readFileSync(0,"utf-8"); const j=JSON.parse(d); console.log(j.last_execution?.task_id || "NONE");')
LOCKED=$(echo "$LOCK" | node -e 'const d=require("fs").readFileSync(0,"utf-8"); const j=JSON.parse(d); console.log(j.locked ? "LOCKED" : "FREE");')
ACTIVE_TICKET=$(echo "$TICKET" | node -e 'const d=require("fs").readFileSync(0,"utf-8"); const j=JSON.parse(d); console.log(j.active && j.ticket ? j.ticket.id : "NONE");')
ACTIVE_MILESTONE=$(echo "$MILESTONE" | node -e 'const d=require("fs").readFileSync(0,"utf-8"); const j=JSON.parse(d); console.log(j.active_milestone?.id || "NONE");')

cat <<EOF
{
  "capability": "runtime.status",
  "status": "PASS",
  "timestamp": "$TS",
  "summary": "Runtime $STATUS, lock $LOCKED, confidence ${CONFIDENCE}",
  "data": {
    "runtime_status": "$STATUS",
    "lock_status": "$LOCKED",
    "confidence": $CONFIDENCE,
    "drift_risk": "$DRIFT",
    "last_task": "$LAST_TASK",
    "active_ticket": "$ACTIVE_TICKET",
    "active_milestone": "$ACTIVE_MILESTONE"
  },
  "warnings": [],
  "errors": [],
  "metrics": {},
  "next_actions": []
}
EOF

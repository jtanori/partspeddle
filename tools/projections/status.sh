#!/bin/bash
# capability: projection.status
# reads: project-governance/runtime/projections/, project-governance/runtime/state/
# writes: nothing
# timeout: 5s

set -euo pipefail

PROJECTIONS_DIR="project-governance/runtime/projections"
STATE_DIR="project-governance/runtime/state"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [ ! -d "$PROJECTIONS_DIR" ]; then
  echo '{"capability":"projection.status","status":"FAIL","timestamp":"'"$TS"'","summary":"Projections directory missing","data":null,"warnings":[],"errors":["Projections directory not found"],"metrics":{},"next_actions":["projection.generate"]}'
  exit 1
fi

# Get state update time
STATE_TIME=$(stat -f%m "$STATE_DIR/active-execution.json" 2>/dev/null || stat -c%Y "$STATE_DIR/active-execution.json" 2>/dev/null || echo 0)
NOW=$(date +%s)
STATE_AGE=$((NOW - STATE_TIME))

# Check each projection
PROJECTIONS=$(find "$PROJECTIONS_DIR" -maxdepth 1 -type f | sort | while read f; do
  NAME=$(basename "$f")
  PTIME=$(stat -f%m "$f" 2>/dev/null || stat -c%Y "$f" 2>/dev/null || echo 0)
  PAGE=$((NOW - PTIME))
  STALE=$((AGE > 300 ? 1 : 0))
  echo "  {\"name\":\"$NAME\",\"age_seconds\":$PAGE,\"stale\":$STALE}"
done | paste -sd ',' -)

echo "{\"capability\":\"projection.status\",\"status\":\"PASS\",\"timestamp\":\"$TS\",\"summary\":\"Projections checked, state age ${STATE_AGE}s\",\"data\":{\"state_age_seconds\":$STATE_AGE,\"projections\":[$PROJECTIONS]},\"warnings\":[],\"errors\":[],\"metrics\":{},\"next_actions\":[]}"

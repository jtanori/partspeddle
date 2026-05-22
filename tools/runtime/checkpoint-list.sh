#!/bin/bash
# capability: runtime.checkpoint.list
# reads: project-governance/runtime/checkpoints/
# writes: nothing
# timeout: 10s

set -euo pipefail

CHECKPOINT_DIR="project-governance/runtime/checkpoints"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [ ! -d "$CHECKPOINT_DIR" ]; then
  echo '{"capability":"runtime.checkpoint.list","status":"FAIL","timestamp":"'"$TS"'","summary":"Checkpoint directory missing","data":{"checkpoints":[]},"warnings":[],"errors":["Checkpoints directory not found"],"metrics":{},"next_actions":[]}'
  exit 1
fi

CHECKPOINTS=$(find "$CHECKPOINT_DIR" -maxdepth 1 -name '*.json' -type f | sort | while read f; do
  NAME=$(basename "$f")
  SIZE=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo 0)
  echo "  {\"name\":\"$NAME\",\"size_bytes\":$SIZE}"
done | paste -sd ',' -)

echo "{\"capability\":\"runtime.checkpoint.list\",\"status\":\"PASS\",\"timestamp\":\"$TS\",\"summary\":\"Checkpoints listed\",\"data\":{\"checkpoints\":[$CHECKPOINTS]},\"warnings\":[],\"errors\":[],\"metrics\":{},\"next_actions\":[]}"

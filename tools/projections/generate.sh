#!/bin/bash
# capability: projection.generate
# reads: project-governance/runtime/state/, project-governance/runtime/heartbeats/
# writes: project-governance/runtime/projections/
# timeout: 15s

set -euo pipefail

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

OUTPUT=$(npx tsx scripts/generate-runtime-projections.ts 2>&1) || true

if echo "$OUTPUT" | grep -q "Runtime projections regenerated successfully"; then
  STATUS="PASS"
  SUMMARY="Projections regenerated"
else
  STATUS="FAIL"
  SUMMARY="Projection generation failed"
fi

cat <<EOF
{
  "capability": "projection.generate",
  "status": "$STATUS",
  "timestamp": "$TS",
  "summary": "$SUMMARY",
  "data": null,
  "warnings": [],
  "errors": [],
  "metrics": {},
  "next_actions": []
}
EOF

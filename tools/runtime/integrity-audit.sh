#!/bin/bash
# capability: runtime.audit
# reads: project-governance/runtime/, meta/
# writes: project-governance/runtime/audits/
# timeout: 30s

set -euo pipefail

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
AUDIT_DIR="project-governance/runtime/audits"
mkdir -p "$AUDIT_DIR"

# Run the TypeScript auditor
OUTPUT=$(npx tsx scripts/audit-runtime-integrity.ts --json 2>&1) || OUTPUT='{"status":"FAIL","score":0,"checks":[]}'

# Parse result
SCORE=$(echo "$OUTPUT" | node -e 'const d=require("fs").readFileSync(0,"utf-8"); try { const j=JSON.parse(d); console.log(j.score || 0); } catch(e) { console.log(0); }' 2>/dev/null || echo 0)
CHECKS=$(echo "$OUTPUT" | node -e 'const d=require("fs").readFileSync(0,"utf-8"); try { const j=JSON.parse(d); console.log(j.checks?.length || 0); } catch(e) { console.log(0); }' 2>/dev/null || echo 0)
PASSED=$(echo "$OUTPUT" | node -e 'const d=require("fs").readFileSync(0,"utf-8"); try { const j=JSON.parse(d); console.log(j.checks?.filter(c=>c.status==="PASS")?.length || 0); } catch(e) { console.log(0); }' 2>/dev/null || echo 0)

STATUS=$(echo "$SCORE >= 0.95" | bc -l | grep -q 1 && echo "PASS" || echo "WARN")

cat <<EOF
{
  "capability": "runtime.audit",
  "status": "$STATUS",
  "timestamp": "$TS",
  "summary": "Integrity audit: $PASSED/$CHECKS passed, confidence ${SCORE}",
  "data": {
    "score": $SCORE,
    "checks_total": $CHECKS,
    "checks_passed": $PASSED
  },
  "warnings": [],
  "errors": [],
  "metrics": {},
  "next_actions": []
}
EOF

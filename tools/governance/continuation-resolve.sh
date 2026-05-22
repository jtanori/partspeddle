#!/bin/bash
# capability: governance.continuation
# reads: project-governance/runtime/state/*, project-management/data/*
# writes: nothing
# timeout: 15s

set -euo pipefail

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Run the TypeScript resolver and capture JSON output
OUTPUT=$(npx tsx scripts/resolve-continuation.ts --json 2>&1) || true

# Check if output is valid JSON
if echo "$OUTPUT" | node -e 'const d=require("fs").readFileSync(0,"utf-8"); JSON.parse(d);' 2>/dev/null; then
  DECISION=$(echo "$OUTPUT" | node -e 'const d=require("fs").readFileSync(0,"utf-8"); console.log(JSON.stringify(JSON.parse(d)));')
  SUMMARY=$(echo "$DECISION" | node -e 'const d=require("fs").readFileSync(0,"utf-8"); const j=JSON.parse(d); console.log(j.reason + ": " + (j.selected_ticket?.id || "NONE"));')
  STATUS=$(echo "$DECISION" | node -e 'const d=require("fs").readFileSync(0,"utf-8"); const j=JSON.parse(d); console.log(j.selected_ticket ? "PASS" : "WARN");')

  echo "{\"capability\":\"governance.continuation\",\"status\":\"$STATUS\",\"timestamp\":\"$TS\",\"summary\":\"$SUMMARY\",\"data\":$DECISION,\"warnings\":[],\"errors\":[],\"metrics\":{},\"next_actions\":[]}"
else
  echo "{\"capability\":\"governance.continuation\",\"status\":\"FAIL\",\"timestamp\":\"$TS\",\"summary\":\"Resolver failed\",\"data\":null,\"warnings\":[],\"errors\":[\"TypeScript resolver exited with error\"],\"metrics\":{},\"next_actions\":[]}"
  exit 1
fi

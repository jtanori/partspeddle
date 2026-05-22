# Recovery: Invalid Runtime State

> **Trigger:** `active-execution.json` fails schema validation, is missing required fields, or contains contradictory state.
> **Authority:** `STATE_MUTATION_RULES.md`
> **Severity:** CRITICAL

---

## Detection

```bash
# Schema validation
cat project-governance/runtime/state/active-execution.json | node -e '
const Ajv = require("ajv");
const ajv = new Ajv();
const schema = require("./meta/schemas/governance-state.schema.json");
const data = JSON.parse(require("fs").readFileSync(0, "utf-8"));
const valid = ajv.validate(schema, data);
console.log(valid ? "VALID" : "INVALID: " + ajv.errorsText());
'
```

OR:
- `runtime_status: ACTIVE` but `execution: null`
- `locked: true` but `execution_active: false`
- `safe_to_resume: true` but no checkpoint exists

---

## Recovery Steps

### Step 1: STOP ALL MUTATIONS

Do not proceed with any execution. Invalid state is a critical failure.

### Step 2: Archive Corrupt State

```bash
cp project-governance/runtime/state/active-execution.json \
   project-governance/runtime/state/active-execution-corrupt-$(date +%s).json
```

### Step 3: Identify Last Known Good State

Check checkpoints in reverse chronological order:

```bash
ls -t project-governance/runtime/checkpoints/*.json | head -5
```

Find the most recent checkpoint with `lifecycle_state: COMPLETE` or `QUIESCENT`.

### Step 4: Reconstruct from Checkpoints + Git

```bash
# Load checkpoint execution state
cat <checkpoint> | node -e '
const d = require("fs").readFileSync(0, "utf-8");
const cp = JSON.parse(d).CHECKPOINT;
console.log(JSON.stringify({
  task_id: cp.metadata.task_id,
  milestone: cp.metadata.milestone,
  status: cp.execution_state.lifecycle_state
}, null, 2));
'

# Verify git state matches
git log --oneline -5
```

### Step 5: Rewrite Canonical State

```bash
cat > project-governance/runtime/state/active-execution.json << 'EOF'
{
  "protocol_version": "1.0.0",
  "runtime_status": "RECOVERING",
  "execution_active": false,
  "safe_to_resume": true,
  "execution": null,
  "safe_exit": null,
  "last_execution": { <from checkpoint or git> },
  "governance_compliance": { <all ACTIVE> },
  "runtime_confidence": { "score": 0.8, ... },
  "drift_risk": { "level": "LOW", "reason": "State reconstructed after corruption" },
  ...
}
EOF
```

### Step 6: Release Lock

```bash
# Force lock release
cat > project-governance/runtime/state/execution-lock.json << 'EOF'
{
  "protocol_version": "1.0.0",
  "locked": false,
  ...
}
EOF
```

### Step 7: Run Full Integrity Audit

```bash
npx tsx scripts/audit-runtime-integrity.ts
```

All 28 checks must pass.

### Step 8: Generate Recovery Checkpoint

Write checkpoint documenting the corruption and reconstruction.

---

## Validation

- [ ] Corrupt state archived
- [ ] Reconstructed state validates against schema
- [ ] No contradictory fields
- [ ] Lock released
- [ ] Integrity audit: 28/28 passed
- [ ] Recovery checkpoint written
- [ ] Confidence score ≥ 0.80

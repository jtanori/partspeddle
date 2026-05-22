# Recovery: Interrupted Session

> **Trigger:** `active-execution.json` shows `status: INTERRUPTED` or session ended without safe exit.
> **Authority:** `CHECKPOINT_PROTOCOL.md`, `SAFE_EXIT_PROTOCOL.md`
> **Severity:** MEDIUM

---

## Detection

```bash
cat project-governance/runtime/state/active-execution.json | \
  node -e 'const d=require("fs").readFileSync(0,"utf-8"); const j=JSON.parse(d); console.log(j.execution?.status || "QUIESCENT");'
# Output: INTERRUPTED
```

OR: Last session ended without `EXECUTION_COMPLETE` footer.

---

## Recovery Steps

### Step 1: Load Checkpoint

```bash
ls -t project-governance/runtime/checkpoints/*.json | head -1
```

### Step 2: Read Resume Contract

```bash
cat project-governance/runtime/projections/resume-instruction.md
```

### Step 3: Validate Resumability

```bash
# Check checkpoint schema
cat <checkpoint> | node -e 'const d=require("fs").readFileSync(0,"utf-8"); JSON.parse(d); console.log("valid");'

# Check lock is free
cat project-governance/runtime/state/execution-lock.json | \
  node -e 'const d=require("fs").readFileSync(0,"utf-8"); const j=JSON.parse(d); console.log(j.locked ? "LOCKED" : "FREE");'
```

If locked: run `meta/recovery/stale-lock.md` first.

### Step 4: Context Rehydration

Load ONLY:
1. `runtime-governance-kernel.md`
2. `active-execution.json`
3. `current-milestone.json`
4. `current-ticket.json`
5. `runtime-bootstrap.json`
6. Domain REFERENCE.md

**Forbidden:** Re-reading full blueprints. Reasoning from conversational memory.

### Step 5: Resume Execution

```bash
# Update state
cat > project-governance/runtime/state/active-execution.json << 'EOF'
{
  "runtime_status": "RECOVERING",
  "execution_active": true,
  "safe_to_resume": true,
  ...
}
EOF
```

Emit `EXECUTION_START` header with `resume_packet_loaded: true`.

---

## Validation

- [ ] Checkpoint validates against schema
- [ ] Lock is free or stale-lock recovery completed
- [ ] Resume contract loaded
- [ ] Context rehydrated from canonical files only
- [ ] `EXECUTION_START` emitted with resume flag

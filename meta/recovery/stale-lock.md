# Recovery: Stale Lock

> **Trigger:** `execution-lock.json` shows `locked: true` but `expires_at` is in the past.
> **Authority:** `STATE_MUTATION_RULES.md`
> **Severity:** MEDIUM

---

## Detection

```bash
cat project-governance/runtime/state/execution-lock.json | node -e '
const d = require("fs").readFileSync(0, "utf-8");
const j = JSON.parse(d);
const now = new Date().toISOString();
const stale = j.locked && j.expires_at && j.expires_at < now;
console.log(stale ? "STALE" : "VALID");
'
```

OR: `active-execution.json` shows `execution_active: true` but no heartbeat in >30 min.

---

## Recovery Steps

### Step 1: Verify Staleness

Confirm lock TTL has expired. Do NOT release a valid lock.

### Step 2: Archive Lock State

```bash
cp project-governance/runtime/state/execution-lock.json \
   project-governance/runtime/state/execution-lock-stale-$(date +%s).json
```

### Step 3: Release Lock

```bash
cat > project-governance/runtime/state/execution-lock.json << 'EOF'
{
  "protocol_version": "1.0.0",
  "locked": false,
  "execution_id": null,
  "locked_at": null,
  "locked_by": null,
  "expires_at": null,
  "released_at": "<ISO8601>",
  "release_reason": "stale_ttl_recovery",
  ...
}
EOF
```

### Step 4: Update Active Execution

```bash
# Mark as INTERRUPTED if was ACTIVE
cat > project-governance/runtime/state/active-execution.json << 'EOF'
{
  "runtime_status": "RECOVERING",
  "execution_active": false,
  "safe_to_resume": true,
  "execution": null,
  ...
}
EOF
```

### Step 5: Generate Recovery Checkpoint

```bash
# Write checkpoint documenting the stale lock recovery
```

---

## Validation

- [ ] Lock file shows `locked: false`
- [ ] `release_reason` is `stale_ttl_recovery`
- [ ] Active execution status is `RECOVERING` or `IDLE`
- [ ] Recovery checkpoint written
- [ ] `repository.validate` passes

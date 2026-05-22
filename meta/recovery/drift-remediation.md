# Recovery: Drift Remediation

> **Trigger:** `active-execution.json` shows `drift_risk.level` ≥ MEDIUM.
> **Authority:** `DRIFT_RECOVERY_PROTOCOL.md`
> **Severity:** HIGH

---

## Detection

```bash
cat project-governance/runtime/state/active-execution.json | node -e '
const d = require("fs").readFileSync(0, "utf-8");
const j = JSON.parse(d);
const level = j.drift_risk?.level || "NONE";
console.log(level);
'
# Output: MEDIUM, HIGH, or CRITICAL
```

---

## Recovery Steps

### Step 1: Classify Drift Type

| Type | Detection | Severity |
|------|-----------|----------|
| Scope | Work outside ticket acceptance criteria | HIGH |
| Architecture | Violation of boundary/constraint rules | CRITICAL |
| Dependency | Cross-domain import or circular reference | HIGH |
| Semantic | Meaning change without version bump | MEDIUM |
| Context | Reasoning from stale or wrong context | MEDIUM |

### Step 2: Stop Mutations

Immediate read-only. No new files. No commits.

### Step 3: Write Drift Event

```bash
cat > project-governance/runtime/drift-events/drift-$(date +%s).json << 'EOF'
{
  "drift_id": "drift_<timestamp>",
  "type": "<scope|architecture|dependency|semantic|context>",
  "severity": "<MEDIUM|HIGH|CRITICAL>",
  "detected_at": "<ISO8601>",
  "task_id": "<active ticket>",
  "description": "<what drifted>",
  "evidence": ["<file>", "<change>"],
  "recovery_status": "IN_PROGRESS"
}
EOF
```

### Step 4: Assess Rollback vs. Repair

- **Scope drift:** Rollback to last checkpoint, re-execute within bounds.
- **Architecture drift:** Rollback mandatory. Violation cannot be repaired forward.
- **Dependency drift:** Repair by extracting interface, adding event boundary.
- **Semantic drift:** Version bump + migration path.
- **Context drift:** Reset context, reload canonical files, resume.

### Step 5: Execute Recovery

Follow type-specific recovery from `DRIFT_RECOVERY_PROTOCOL.md` Section 4.

### Step 6: Validate Resolution

Re-run integrity audit:

```bash
npx tsx scripts/audit-runtime-integrity.ts
```

Confidence must return to ≥ 0.95.

### Step 7: Close Drift Event

Update drift event `recovery_status` to `RESOLVED`.

---

## Validation

- [ ] Drift event written and classified
- [ ] Recovery executed per type-specific protocol
- [ ] Integrity audit passes with confidence ≥ 0.95
- [ ] Drift event closed as RESOLVED
- [ ] No new drift detected within 5 minutes

---
authority:
  level: protocol
  layer: 2
  canonical: true
  supersedes: []
  derives_from:
    - ../CANONICAL_AUTHORITY_HIERARCHY.md
    - ../runtime/runtime-governance-kernel.md
  scope: state
  status: active
  version: 1.0.0
---

# State Mutation Rules

> **Authority:** `EXECUTION_LIFECYCLE_PROTOCOL.md`, `runtime-governance-kernel.md` Section 3  
> **Scope:** Who and what may mutate `runtime/state/active-execution.json`.  
> **Purpose:** Prevent concurrent mutation chaos, conflicting ticket ownership, and checkpoint corruption.  
> **Version:** 1.0.0  
> **Status:** Active

---

## 1. The Golden Rule

> **`active-execution.json` is the single source of truth for runtime execution state.**  
> **Only 5 events may mutate it.**  
> **All other writes are protocol violations.**

This rule exists because `active-execution.json` is the kernel of the governance runtime. If it becomes inconsistent, every downstream projection (status reports, heartbeats, drift detection) becomes a lie.

---

## 2. Lock Architecture

### 2.1 execution-lock.json

Before any mutation of `active-execution.json`, the mutator must hold the lock:

```
project-governance/runtime/state/execution-lock.json
```

Lock semantics:

| Field | Meaning |
|-------|---------|
| `locked` | `true` = lock held; `false` = lock free |
| `execution_id` | The execution that holds the lock |
| `locked_at` | ISO 8601 timestamp of lock acquisition |
| `locked_by` | Agent session ID or human identifier |
| `expires_at` | Lock auto-expires after `lock_ttl_minutes` |

### 2.2 Lock Acquisition Rules

An execution may acquire the lock **only if**:

1. `locked === false` OR `expires_at` is in the past (stale lock recovery).
2. `active-execution.json.execution_active === false` OR the current execution is the lock holder.
3. The ticket being activated exists in the ticket system.
4. All ticket dependencies are in `COMPLETE` status.

### 2.3 Lock Release Rules

The lock is released automatically when:

1. `active-execution.json.execution.status` transitions to a terminal state (`COMPLETE`, `FAILED`, `ROLLED_BACK`).
2. The lock TTL expires and no heartbeat has been emitted in the last 15 minutes.
3. A human operator explicitly releases it via governance override (logged in `drift-events/`).

---

## 3. Permitted Mutation Events

Only these 5 events may write to `active-execution.json`:

### Event 1: Heartbeat

**Trigger:** Every 10 minutes, 5 files, or 1 architecture mutation.

**Fields mutated:**
- `execution.last_heartbeat`
- `execution.execution.progress_percent`
- `execution.execution.confidence`
- `execution.execution.phase`
- `execution.files` (incremental update)
- `execution.drift` (if self-assessment detected risk)

**Validation:** Lock must be held. `execution_active === true`.

### Event 2: Checkpoint

**Trigger:** Any of the 10 mandatory checkpoint triggers (see CHECKPOINT_PROTOCOL.md).

**Fields mutated:**
- `execution.checkpoint.latest_checkpoint_id`
- `execution.checkpoint.latest_checkpoint_path`
- `execution.checkpoint.sequence_number`
- `execution.resume.safe_resume_point`
- `execution.resume.rollback_available`

**Validation:** Lock must be held. Checkpoint payload must validate against schema.

### Event 3: Ticket Transition

**Trigger:** State transition per EXECUTION_LIFECYCLE_PROTOCOL.md.

**Fields mutated:**
- `execution.status`
- `execution.execution.phase`
- `execution.next_actions`

**Validation:** Transition must be in the allowed transition table. Forbidden transitions are rejected.

### Event 4: Drift Event

**Trigger:** Drift detected by heartbeat self-assessment or validation gate failure.

**Fields mutated:**
- `execution.drift.detected`
- `execution.drift.severity`
- `execution.drift.details`
- `execution.drift.drift_event_path`
- `execution.status` (may transition to `BLOCKED` or `FAILED`)

**Validation:** Drift event must be written to `runtime/drift-events/` before mutating active-execution.json.

### Event 5: Execution Completion

**Trigger:** All governance gates passed (GOVERNANCE_GATES.md).

**Fields mutated:**
- `execution.status` → `COMPLETE`
- `execution_active` → `false`
- `execution.completion.completed_at`
- `execution.completion.completion_report_path`

**Post-mutation:** The full execution object is archived to `runtime/execution-history/{execution_id}.json` and `active-execution.json.execution` is set to `null`.

---

## 4. Forbidden Mutations

The following are **never** permitted:

| Forbidden Action | Why |
|------------------|-----|
| Direct human editing of `active-execution.json` | Humans must mutate via ticket transitions or governance override events. |
| Agent modifying `active-execution.json` without holding the lock | Prevents race conditions during context compaction or parallel tool use. |
| Writing to `active-execution.json` during `PLANNED` or `IDLE` state | Only `READY` through `ROLLED_BACK` states support active execution records. |
| Mutating historical `execution-history/` files | History is immutable. Corrections require new tickets. |
| Modifying `active-execution.json` from arbitrary agent chatter | Only the 5 events above are valid mutation paths. |

---

## 5. Mutation Audit Trail

Every mutation event must append a record to:

```
project-governance/runtime/execution-logs/mutation-log.jsonl
```

Format:

```json
{"event":"heartbeat","timestamp":"2026-05-20T19:03:00Z","execution_id":"EXEC-2026-05-20-001","fields_changed":["last_heartbeat","progress_percent"],"mutator":"agent_session_abc123"}
```

This log is append-only and never deleted. It provides governance forensics.

---

## 6. Recovery from Corruption

If `active-execution.json` is detected as corrupt (schema validation fails, missing required fields, inconsistent state):

1. **HALT** all execution.
2. **Read** the latest valid checkpoint.
3. **Read** the latest entry in `mutation-log.jsonl`.
4. **Reconstruct** `active-execution.json` from checkpoint + replay of mutations since checkpoint.
5. **Validate** the reconstructed file.
6. **Resume** from the reconstructed safe state.

If reconstruction fails, the execution is marked `FAILED` and a human must intervene.

## 8. Integration with Other Protocols

| Protocol | Integration Point |
|----------|-------------------|
| `EXECUTION_LIFECYCLE_PROTOCOL.md` | Mutations correspond to lifecycle state transitions. |
| `CHECKPOINT_PROTOCOL.md` | Checkpoint is Event 2 — permitted mutation. |
| `HEARTBEAT_POLICY.md` | Heartbeat is Event 1 — permitted mutation. |
| `DRIFT_RECOVERY_PROTOCOL.md` | Drift event is Event 4 — permitted mutation. |
| `GOVERNANCE_GATES.md` | Gates validate before completion mutation (Event 5). |
| `SAFE_EXIT_PROTOCOL.md` | Safe exit is an additional permitted mutation that transitions to quiescent state. |

---

## 9. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-20 | Initial rules. 5 permitted mutation events, lock architecture, forbidden mutations, audit trail. |

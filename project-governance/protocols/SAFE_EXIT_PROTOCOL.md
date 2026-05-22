# Safe Exit Protocol

> **Authority:** `EXECUTION_LIFECYCLE_PROTOCOL.md`, `STATE_MUTATION_RULES.md`  
> **Scope:** Formal transactional exit from any execution state into a resumable quiescent state.  
> **Purpose:** Stateless sessions with stateful runtime persistence.  
> **Version:** 1.0.0  
> **Status:** Active

---

## 1. Purpose

A safe exit is **not** "stop working." It is a transactional transition of the execution runtime into a **resumable quiescent state**.

Without this protocol:
- Sessions die with in-flight ambiguity
- Partial mutations create uncertainty
- Execution ownership becomes orphaned
- Checkpoints go stale
- Runtime state drifts
- Resumability becomes probabilistic

With this protocol:
- Every exit is a clean shutdown
- Future sessions have a deterministic restart path
- No state is lost to context window death
- The execution runtime survives independently of any agent session

**This is transactional consistency for AI execution.**

---

## 2. Safe Exit Triggers

A safe exit **MUST** be performed when any of the following occur:

| Trigger | Rationale |
|---------|-----------|
| **Context window approaching limit** | Prevent mid-mutation truncation. |
| **User explicitly requests stop** | Graceful yield, not abrupt termination. |
| **Agent detects exhaustion** | Self-awareness that quality is degrading. |
| **Checkpoint threshold reached** | Natural pause point before next work unit. |
| **Drift risk escalates to HIGH** | Pause and reassess rather than continue blindly. |
| **External blocker discovered** | Cannot proceed until external dependency resolves. |
| **Session timeout imminent** | Platform or infrastructure time limit. |
| **Milestone or ticket completion** | Terminal safe exit after successful delivery. |

**Rule:** If a session ends without performing this protocol, the next session **MUST** treat the execution as `INTERRUPTED` and perform recovery before resuming.

---

## 3. Safe Exit Sequence

The agent **MUST** perform all 7 steps in order. Skipping any step is a protocol violation.

### Step 1: Stop Mutation Operations

Execution becomes **read-only**.

No more:
- File changes (create, modify, delete)
- Schema changes
- Dependency modifications
- Ticket status transitions
- Git commits
- Database migrations

**Validation:** `git status` must stabilize. No new changes after this point.

### Step 2: Flush Runtime State

Persist all volatile runtime state to disk:

| State | Destination |
|-------|-------------|
| Active execution | `runtime/state/active-execution.json` |
| Latest heartbeat | `runtime/heartbeats/{task_id}-heartbeat-seq-{n}.json` |
| Latest checkpoint | `runtime/checkpoints/{task_id}-checkpoint-seq-{n}.json` |
| Drift events | `runtime/drift-events/{task_id}-drift-{timestamp}.json` |
| Validation results | `runtime/completion-reports/` (if terminal) |
| Projections | `runtime/projections/` (regenerate all) |

**Validation:** Every file listed above must exist and be non-empty after flush.

### Step 3: Generate Final Checkpoint

This is the **resumability anchor**. It must be the most comprehensive checkpoint of the execution.

```yaml
SAFE_EXIT_CHECKPOINT:
  metadata:
    checkpoint_id: "cp_T11.1_20260521_184500_exit"
    protocol_version: "1.0.0"
    task_id: "T11.1"
    milestone: "M11"
    sequence_number: 5
    timestamp: "2026-05-21T18:45:00Z"
    trigger: "safe_exit"
    exit_reason: "context_window_limit"

  execution_state:
    lifecycle_state: "INTERRUPTED"
    phase: "validation"
    current_surface: "shared"
    reasoning_cycles_since_last_checkpoint: 1
    files_modified_since_last_checkpoint: 2

  completed_work:
    files_created:
      - "meta/README.md"
      - "meta/schemas/milestone.schema.json"
    files_modified: []
    files_deleted: []
    validations_passed:
      - "schema_validation"
    validations_failed: []
    validations_skipped: []

  pending_work:
    - "Validate ticket schema against existing T3.5"
    - "Generate checkpoint template"

  modified_files_snapshot:
    - path: "meta/schemas/milestone.schema.json"
      checksum: "sha256:abc123..."
      lines_added: 45
      lines_removed: 0

  rollback_point:
    git_commit: "abc1234"
    git_branch: "feature/T11.1-governance-root"
    clean_working_tree: false
    stashed_changes: false

  unresolved_risks:
    - "T3.5 may fail strict schema validation due to metadata fields"

  next_safe_resume_step:
    description: "Validate ticket schema against existing T3.5.json"
    estimated_effort_minutes: 10
    dependencies: []
    required_context:
      - "project-management/data/tickets/T3.5.json"
      - "meta/schemas/ticket.schema.json"

  resume_contract:
    can_resume_from_this_checkpoint: true
    requires_context_rehydration: true
    context_files_to_load:
      - "runtime/state/active-execution.json"
      - "runtime/state/current-milestone.json"
      - "runtime/state/current-ticket.json"
      - "runtime/bootstrap/runtime-bootstrap.json"
      - "runtime/projections/resume-instruction.md"
    forbidden_actions_on_resume:
      - "Do NOT recreate already-created files"
      - "Do NOT re-run already-passing validations"
```

### Step 4: Generate Resume Contract

The system **MUST** tell future sessions exactly how to resume.

This produces two artifacts:

#### 4A. runtime-bootstrap.json

The minimum viable context required to restart the system.

```json
{
  "protocol_version": "1.0.0",
  "bootstrap_type": "SAFE_EXIT",
  "generated_at": "2026-05-21T18:45:00Z",
  "latest_checkpoint": {
    "id": "cp_T11.1_20260521_184500_exit",
    "path": "runtime/checkpoints/cp_T11.1_20260521_184500_exit.json"
  },
  "current_milestone": {
    "id": "M11",
    "title": "Governance Root Normalization"
  },
  "current_ticket": {
    "id": "T11.1",
    "title": "Create /meta root directory structure",
    "status": "in_progress"
  },
  "safe_resume_point": "validation-phase-complete",
  "resume_phase": "validation",
  "runtime_integrity_hash": "sha256:def789...",
  "unresolved_blockers": [],
  "required_context_files": [
    "runtime/state/active-execution.json",
    "runtime/state/current-milestone.json",
    "runtime/state/current-ticket.json",
    "runtime/bootstrap/runtime-bootstrap.json"
  ],
  "safe_exit_compliant": true
}
```

#### 4B. resume-instruction.md

Human-readable and AI-parseable resume instructions.

```markdown
# Resume Instruction

> **Generated:** 2026-05-21T18:45:00Z  
> **Exit Type:** SAFE_EXIT  
> **Protocol:** SAFE_EXIT_PROTOCOL.md v1.0.0  

---

## System Status

SAFE EXIT COMPLETE

## Last Active Execution

| Attribute | Value |
|-----------|-------|
| **Execution ID** | EXEC-2026-05-21-001 |
| **Task** | T11.1 — Create /meta root directory structure |
| **Milestone** | M11 — Governance Root Normalization |
| **Status at Exit** | INTERRUPTED |
| **Phase at Exit** | validation |

## Safe Resume Point

**validation-phase-complete**

## Required Resume Procedure

1. Validate runtime integrity per `runtime/bootstrap/runtime-bootstrap.json`
2. Restore checkpoint `cp_T11.1_20260521_184500_exit`
3. Reacquire execution lock (`runtime/state/execution-lock.json`)
4. Resume heartbeat monitoring
5. Continue pending validations

## Files Already Created

- `meta/README.md`
- `meta/schemas/milestone.schema.json`

## Pending Work

- Validate ticket schema against existing T3.5
- Generate checkpoint template

## Risks to Verify on Resume

- T3.5 may fail strict schema validation due to metadata fields
```

### Step 5: Release Execution Lock

The lock **MUST** be released cleanly.

```json
{
  "locked": false,
  "execution_id": null,
  "locked_at": null,
  "locked_by": null,
  "expires_at": null,
  "released_at": "2026-05-21T18:45:00Z",
  "release_reason": "safe_exit"
}
```

**Validation:** `execution-lock.json.locked === false` before exit completes.

### Step 6: Run Continuation Resolution

Execute the work continuation protocol to determine the next ticket:

```bash
npx tsx scripts/resolve-continuation.ts
```

This emits a `CONTINUATION_DECISION` that becomes the proposal for the next execution. The result must be persisted to `runtime/projections/continuation-decision.json`.

**Validation:** The `CONTINUATION_DECISION` file exists and contains a valid `selected_ticket` or explicit `NO_VALID_TICKET` reason.

> **Rule:** Safe exit is incomplete until continuation resolution has run.

### Step 7: Validate Repository State

Before terminal state:

```bash
tools/repository/validate.sh
```

**Validation:**
- Worktree is clean OR all changes are committed
- Branch name matches execution context
- At least one semantic commit exists for this ticket

**If worktree is dirty:** Commit or stash before exit. Uncommitted work is a protocol violation.

### Step 8: Transition Runtime State

Set `active-execution.json` to quiescent:

```json
{
  "protocol_version": "1.0.0",
  "runtime_status": "QUIESCENT",
  "execution_active": false,
  "safe_to_resume": true,
  "execution": null,
  "safe_exit": {
    "exit_reason": "context_window_limit",
    "exited_at": "2026-05-21T18:45:00Z",
    "exit_checkpoint_id": "cp_T11.1_20260521_184500_exit",
    "exit_checkpoint_path": "runtime/checkpoints/cp_T11.1_20260521_184500_exit.json",
    "resume_instruction_path": "runtime/projections/resume-instruction.md",
    "bootstrap_path": "runtime/bootstrap/runtime-bootstrap.json",
    "projections_regenerated": true,
    "lock_released": true
  },
  "last_execution": {
    "execution_id": "EXEC-2026-05-21-001",
    "task_id": "T11.1",
    "milestone_id": "M11",
    "status": "INTERRUPTED",
    "started_at": "2026-05-21T18:00:00Z",
    "completed_at": null,
    "checkpoint_path": "runtime/checkpoints/cp_T11.1_20260521_184500_exit.json",
    "completion_report_path": null
  },
  "system": {
    "name": "VINTRACK",
    "version": "0.1.0",
    "updated_at": "2026-05-21T18:45:00Z"
  }
}
```

**Validation:**
- `runtime_status` is `QUIESCENT`
- `safe_to_resume` is `true`
- `safe_exit.lock_released` is `true`
- `safe_exit.exit_checkpoint_path` exists
- `safe_exit.resume_instruction_path` exists
- `safe_exit.bootstrap_path` exists

---

## 4. Unsafe Exit Detection

If a session terminates without performing the safe exit protocol, the next session must detect this and perform recovery.

### Detection Signals

| Signal | Meaning |
|--------|---------|
| `execution-lock.json.locked === true` AND `expires_at` in past | Stale lock from crashed session |
| `active-execution.json.runtime_status === "ACTIVE"` AND no heartbeat in >30 min | Session died without exit |
| `active-execution.json.execution_active === true` AND `execution.status === "EXECUTING"` | Execution in limbo |
| Missing `safe_exit` block in `active-execution.json` | Prior session did not exit cleanly |

### Recovery Procedure

```
1. DETECT unsafe exit via signals above
2. PRESERVE state: snapshot active-execution.json to drift-events/
3. CLASSIFY as CONTEXT_DRIFT (session death)
4. LOAD latest checkpoint (may be stale — verify age)
5. GENERATE recovery checkpoint with `trigger: "unsafe_exit_recovery"`
6. UPDATE active-execution.json: runtime_status = "RECOVERING"
7. REACQUIRE lock (stale lock override permitted)
8. RESUME from `next_safe_resume_step` in latest checkpoint
9. EMIT recovery heartbeat with `execution_health: "DEGRADED"`
```

---

## 5. Exit Type Classification

| Exit Type | Description | `exit_reason` | `safe_to_resume` |
|-----------|-------------|---------------|------------------|
| **INTENTIONAL** | Agent deliberately pauses | `context_window_limit`, `user_request`, `checkpoint_threshold` | `true` |
| **EXHAUSTION** | Agent detects quality degradation | `agent_exhaustion` | `true` |
| **BLOCKER** | External dependency blocks progress | `external_blocker` | `true` |
| **TIMEOUT** | Infrastructure time limit reached | `session_timeout` | `true` |
| **TERMINAL** | Milestone or ticket completed | `completion` | `true` |
| **UNSAFE** | Session died without protocol | `session_death` (detected post-hoc) | `false` until recovery |

---

## 6. Integration with Other Protocols

| Protocol | Integration Point |
|----------|-------------------|
| `EXECUTION_LIFECYCLE_PROTOCOL.md` | Safe exit transitions execution to `INTERRUPTED` or `COMPLETE`. `QUIESCENT` is a runtime state, not a lifecycle state. |
| `CHECKPOINT_PROTOCOL.md` | Safe exit generates the most comprehensive checkpoint of the execution. |
| `HEARTBEAT_POLICY.md` | Final heartbeat is emitted during Step 2 (flush). |
| `STATE_MUTATION_RULES.md` | Safe exit is a permitted mutation event — it writes to `active-execution.json`, releases the lock, and generates the bootstrap file. |
| `DRIFT_RECOVERY_PROTOCOL.md` | Unsafe exits are classified as `CONTEXT_DRIFT` and recovered via drift recovery protocol. |

---

## 7. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-21 | Initial protocol. 6-step exit sequence, bootstrap file, resume instruction, unsafe exit detection, recovery procedure. |

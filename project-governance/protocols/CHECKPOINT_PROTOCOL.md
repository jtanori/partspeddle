---
authority:
  level: protocol
  layer: 2
  canonical: true
  supersedes: []
  derives_from:
    - ../CANONICAL_AUTHORITY_HIERARCHY.md
    - ../runtime/runtime-governance-kernel.md
  scope: recovery
  status: active
  version: 1.0.0
---

# Checkpoint / Resume Protocol

> **Authority:** `EXECUTION_LIFECYCLE_PROTOCOL.md` Section 5, `runtime-governance-kernel.md` Section 3  
> **Scope:** State persistence and interruption recovery for all agent executions.  
> **Purpose:** Without resumability, long-running AI governance collapses.  
> **Version:** 1.0.0  
> **Status:** Active

---

## 1. Purpose

This protocol defines when checkpoints are written, what they contain, and how execution resumes from them. It ensures that **no work is lost to context window limits, user interruptions, or system failures**.

**Without this protocol:** Every interruption requires re-reading the entire codebase and re-reasoning from scratch.  
**With this protocol:** Interruption is a pause, not a reset.

---

## 2. Checkpoint Triggers

A checkpoint **MUST** be written when **any** of the following conditions occur:

### 2.1 Mandatory Checkpoints

| Trigger | Rationale |
|---------|-----------|
| **Before architecture mutation** | Structural changes (new directories, moved domains) are hard to reverse. |
| **Before large refactors** | Refactors touch many files; rollback without a checkpoint is expensive. |
| **After milestone completion** | Milestones are governance boundaries; state must be persisted. |
| **Every 10 files modified** | File count is a proxy for complexity and drift risk. |
| **Every 30 minutes of execution** | Time-based guardrail against silent drift. |
| **Before dependency changes** | Adding/removing dependencies affects the entire dependency graph. |
| **Before database migrations** | Migrations are irreversible without explicit down-migration. |
| **Before contract lock changes** | CONTRACT_LOCK is a critical governance boundary. |
| **On state transition to BLOCKED** | Blocked state must be resumable when the blocker clears. |
| **On state transition to INTERRUPTED** | Obviously required for resume. |

### 2.2 Optional Checkpoints

| Trigger | Rationale |
|---------|-----------|
| **Before high-risk file deletion** | Deletions are destructive. |
| **After complex reasoning cycles** | If the agent performed >3 reasoning cycles without file modification, checkpoint the reasoning state. |
| **User request** | Human-in-the-loop may demand a checkpoint at any time. |

### 2.3 Checkpoint Throttling

To prevent checkpoint spam:

- Minimum interval between checkpoints: **5 minutes** (except INTERRUPTED, which is always immediate).
- Maximum un-checkpointed file modifications: **10 files**.
- Maximum un-checkpointed execution time: **30 minutes**.

If any threshold is exceeded, the agent **MUST** pause execution and write a checkpoint before continuing.

---

## 3. Checkpoint Payload

Every checkpoint **MUST** contain the following structure:

```yaml
CHECKPOINT:
  metadata:
    checkpoint_id: "cp_T3.7_20260520_024500"
    protocol_version: "1.0.0"
    task_id: "T3.7"
    milestone: "M3"
    sequence_number: 3              # Incrementing counter for this task
    timestamp: "2026-05-20T02:45:00Z"
    trigger: "file_count_threshold" # Why this checkpoint was written

  execution_state:
    lifecycle_state: "EXECUTING"    # From EXECUTION_LIFECYCLE_PROTOCOL.md
    phase: "implementation"
    current_surface: "frontend"
    reasoning_cycles_since_last_checkpoint: 2
    files_modified_since_last_checkpoint: 7

  completed_work:
    files_created:
      - "tests/e2e/frontend/homepage.spec.ts"
      - "tests/e2e/frontend/auth.spec.ts"
    files_modified:
      - "playwright.config.ts"
    files_deleted: []
    validations_passed:
      - "typecheck"
    validations_failed: []
    validations_skipped:
      - "lint"

  pending_work:
    - "Write search E2E test"
    - "Run full E2E suite against local backend"
    - "Generate completion report"

  modified_files_snapshot:
    - path: "tests/e2e/frontend/homepage.spec.ts"
      checksum: "sha256:abc123..."
      lines_added: 45
      lines_removed: 0
    - path: "playwright.config.ts"
      checksum: "sha256:def456..."
      lines_added: 12
      lines_removed: 3

  rollback_point:
    git_commit: "abc1234"
    git_branch: "feature/T3.7-e2e-tests"
    clean_working_tree: false
    stashed_changes: true

  unresolved_risks:
    - "E2E tests require backend running — may fail in CI if infra not available"

  next_safe_resume_step:
    description: "Write search E2E test in tests/e2e/frontend/search.spec.ts"
    estimated_effort_minutes: 15
    dependencies: []
    required_context: []

  resume_contract:
    can_resume_from_this_checkpoint: true
    requires_context_rehydration: false
    context_files_to_load:
      - "project-governance/runtime/runtime-state.json"
      - "project-governance/runtime/checkpoints/active-execution.md"
      - "project-knowledge/frontend/frontend-REFERENCE.md"
    forbidden_actions_on_resume:
      - "Do NOT re-run already-passing validations"
      - "Do NOT recreate already-created files"

  previous_checkpoint: "project-governance/runtime/checkpoints/T3.7-checkpoint-seq-2.json"
```

### 3.1 Payload Validation Rules

| Field | Required | Validation |
|-------|----------|------------|
| `checkpoint_id` | Yes | Unique. Format: `cp_{task_id}_{YYYYMMDD}_{HHMMSS}`. |
| `sequence_number` | Yes | Integer ≥ 1. Must increment monotonically per task. |
| `trigger` | Yes | Must be one of the defined triggers in Section 2. |
| `execution_state.lifecycle_state` | Yes | Must be a valid state per EXECUTION_LIFECYCLE_PROTOCOL.md. |
| `completed_work` | Yes | Must match actual git state at `rollback_point.git_commit`. |
| `pending_work` | Yes | Non-empty unless task is terminal. |
| `next_safe_resume_step` | Yes | Must be concrete, actionable, and bounded. |
| `resume_contract` | Yes | Must specify what to load and what NOT to redo. |

---

## 4. Resume Contract

Every interruption must be resumable from **exact milestone, exact ticket, exact mutation state** without re-reading the entire context.

### 4.1 Resume Procedure

```
1. LOAD checkpoint file
2. VALIDATE checkpoint schema version matches current protocol
3. READ execution_state.lifecycle_state
4. IF state is COMPLETE, FAILED, or ROLLED_BACK:
     STOP — this checkpoint is stale. Load latest-checkpoint.json instead.
5. READ resume_contract.context_files_to_load
6. LOAD each context file (NO conversational memory)
7. READ next_safe_resume_step
8. VERIFY next_safe_resume_step.dependencies are resolved
9. VERIFY next_safe_resume_step.required_context is available
10. RE-HYDRATE execution state
11. RESUME from next_safe_resume_step
```

### 4.2 Resume Anti-Patterns (Forbidden)

| Anti-Pattern | Why Forbidden |
|--------------|---------------|
| Re-reading the entire blueprint | Wastes context window; contradicts checkpoint purpose. |
| Re-creating already-created files | Wastes time; may overwrite manual edits. |
| Re-running already-passing validations | Wastes time; may fail due to environmental differences. |
| Reasoning from conversational memory | Memory is unreliable after compaction. Checkpoint is truth. |
| Skipping the resume contract | Leads to context mismatch and drift. |

### 4.3 Context Rehydration

If `requires_context_rehydration: true`, the agent must load:

1. `runtime/state/active-execution.json` — canonical runtime execution state.
2. `runtime-state.json` — for active milestone/ticket.
3. `checkpoints/active-execution.md` — for execution header.
4. Domain REFERENCE.md — for the bounded context (≤ 400 lines).
5. **NOT** full blueprints (> 3000 lines).

---

## 5. Checkpoint Storage

### 5.1 Directory Layout

```
project-governance/runtime/
├── state/
│   ├── active-execution.json           # Canonical runtime execution state
│   ├── execution-lock.json             # Concurrency lock
│   ├── current-ticket.json             # Lightweight ticket snapshot
│   └── current-milestone.json          # Lightweight milestone snapshot
├── checkpoints/
│   ├── latest-checkpoint.json          # Symlink or copy of most recent checkpoint
│   ├── active-execution.md             # Current execution header + state overlay
│   ├── T3.7-checkpoint-seq-1.json
│   ├── T3.7-checkpoint-seq-2.json
│   ├── T3.7-checkpoint-seq-3.json
│   └── archive/                        # Checkpoints older than 30 days
├── heartbeats/
├── execution-logs/
├── drift-events/
└── projections/
    ├── latest-status.md
    ├── latest-heartbeat.md
    └── current-context.md
```

### 5.2 Retention Policy

- **Active checkpoints:** Retain for 30 days after task completion.
- **Latest-checkpoint.json:** Always overwrite; never archive.
- **Archive:** Move checkpoints to `archive/` after 30 days.
- **Deletion:** Permitted only after a milestone is marked `completed` and all downstream tickets are verified.

### 5.3 Naming Convention

```
{task_id}-checkpoint-seq-{sequence_number}.json
```

Example: `T3.7-checkpoint-seq-3.json`

---

## 6. Checkpoint Validation Gate

Before a checkpoint is considered valid, it must pass:

- [ ] Schema validation against `checkpoint.schema.json`.
- [ ] `completed_work` matches `git diff --name-status` at `rollback_point.git_commit`.
- [ ] `pending_work` is non-empty (for non-terminal states).
- [ ] `next_safe_resume_step` is concrete and bounded (≤ 30 minutes estimated effort).
- [ ] `resume_contract.can_resume_from_this_checkpoint` is `true`.

If any check fails, the checkpoint is **rejected** and must be rewritten.

## 7. Integration with Other Protocols

| Protocol | Integration Point |
|----------|-------------------|
| `EXECUTION_LIFECYCLE_PROTOCOL.md` | Checkpoint written during `EXECUTING` and `CHECKPOINT_PENDING` states. |
| `HEARTBEAT_POLICY.md` | Missing heartbeats trigger checkpoint on resume. High drift risk triggers immediate checkpoint. |
| `DRIFT_RECOVERY_PROTOCOL.md` | Recovery sequences use checkpoints as safe resume points. |
| `STATE_MUTATION_RULES.md` | Checkpoint is Event 2 — one of 5 permitted mutations of `runtime/state/active-execution.json`. |
| `SAFE_EXIT_PROTOCOL.md` | Safe exit generates the most comprehensive checkpoint of the execution. |

---

## 8. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-20 | Initial protocol. 10 mandatory triggers, full payload schema, resume contract, anti-patterns. |

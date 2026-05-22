# Execution Lifecycle Protocol

> **Authority:** `runtime-governance-kernel.md` Section 3  
> **Scope:** Universal execution wrapper for all agent work. **Nothing executes outside this lifecycle.**  
> **Version:** 1.0.0  
> **Status:** Active

---

## 1. Purpose

This protocol defines the canonical state machine, mandatory headers, and mandatory footers for every execution unit. It eliminates ambiguity in state semantics, forces contextual grounding at start-of-work, and enforces accountability at end-of-work.

**Without this protocol:** Agents drift, lose scope, hallucinate progress, and produce unresumable state.  
**With this protocol:** Every execution is bounded, traceable, checkpointed, and recoverable.

---

## 2. Execution States

The following states are **canonical and immutable**. No additional states may be introduced without a governance amendment.

| State | Semantics | Entry Trigger | Exit Trigger |
|-------|-----------|---------------|--------------|
| **PLANNED** | Task exists in ticket system but has not been prepared for execution. | Ticket created and validated against schema. | Execution header written and dependencies satisfied. |
| **READY** | Task is prepared, dependencies are resolved, and execution may begin. | Dependencies complete; scope lock acquired; rollback point identified. | `EXECUTION_START` header emitted. |
| **EXECUTING** | Active work is in progress. File modifications, reasoning, and validation occur here. | `EXECUTION_START` acknowledged. | Work paused for checkpoint, blocked, failed, interrupted, or complete. |
| **CHECKPOINT_PENDING** | Work is paused to persist state before continuing. | Checkpoint trigger fired (see CHECKPOINT_PROTOCOL.md). | Checkpoint written and validated. |
| **BLOCKED** | Execution cannot continue due to an external dependency or unsatisfied precondition. | Blocker detected during execution. | Blocker resolved and scope re-validated. |
| **FAILED** | Execution terminated without achieving acceptance criteria. | Validation gate failed; unrecoverable error; drift detected. | Rollback executed or failure escalated. |
| **INTERRUPTED** | Execution halted by external event (context window, user stop, system failure). | Context compaction; user interruption; process termination. | Resume packet loaded; state reconstructed. |
| **COMPLETE** | Execution terminated successfully with all acceptance criteria met. | All validations passed; completion report generated. | None — terminal state. |
| **ROLLED_BACK** | Execution was reverted to a prior safe state. | Rollback triggered by FAILURE, DRIFT, or user escalation. | State restored; ticket returned to PLANNED or READY. |

### 2.1 State Transition Rules

```
PLANNED → READY          (dependencies resolved)
READY   → EXECUTING      (EXECUTION_START emitted)
EXECUTING → CHECKPOINT_PENDING  (checkpoint trigger)
CHECKPOINT_PENDING → EXECUTING  (checkpoint validated)
EXECUTING → BLOCKED      (blocker detected)
BLOCKED → EXECUTING      (blocker cleared)
EXECUTING → FAILED       (unrecoverable failure)
EXECUTING → INTERRUPTED  (external halt)
EXECUTING → COMPLETE     (all criteria met)
FAILED → ROLLED_BACK     (rollback executed)
INTERRUPTED → EXECUTING  (resume successful)
INTERRUPTED → READY      (resume failed; re-plan required)
ROLLED_BACK → PLANNED    (re-queue for re-execution)
```

**Forbidden transitions:**
- PLANNED → EXECUTING (must pass through READY)
- COMPLETE → any state (terminal)
- FAILED → COMPLETE (must roll back first)
- BLOCKED → COMPLETE (must resume executing first)

---

## 3. Mandatory Execution Header

Every task execution **MUST** begin with the following header. This is non-negotiable. Omitting the header is a protocol violation.

```yaml
EXECUTION_START:
  protocol_version: "1.0.0"
  timestamp: "2026-05-20T01:50:26Z"
  task_id: "T3.7"
  milestone: "M3"
  domain: "Frontend"
  surface: "frontend"           # frontend | backend | shared | fullstack
  scope:
    in:
      - "Playwright E2E config"
      - "MSW mock handlers"
    out:
      - "Backend API changes"
      - "Database schema changes"
  dependencies:
    resolved:
      - "T3.4"
      - "T3.5"
    external: []                # blockers not yet resolved
  estimated_risk: "LOW"         # LOW | MEDIUM | HIGH | CRITICAL
  rollback_available: true
  rollback_point: "git commit abc1234"
  checkpoint_strategy: "every_10_files_or_30_min"
  acceptance_criteria:
    - "E2E tests pass in CI"
    - "Homepage loads and shows listings"
  contract_locks:
    - "src/shared/contracts/search/*"
  resume_packet_loaded: true
  previous_checkpoint: "checkpoints/latest-checkpoint.json"
```

### 3.1 Header Validation Rules

| Field | Required | Validation |
|-------|----------|------------|
| `protocol_version` | Yes | Must match `EXECUTION_LIFECYCLE_PROTOCOL.md` version. |
| `timestamp` | Yes | ISO 8601, UTC. |
| `task_id` | Yes | Must exist in ticket system. Format: `T{milestone}.{sequence}`. |
| `milestone` | Yes | Must exist in milestone system. |
| `surface` | Yes | Must be one of: `frontend`, `backend`, `shared`, `fullstack`. |
| `scope.in` | Yes | Non-empty array. Defines what is being built. |
| `scope.out` | Yes | Array (may be empty). Defines what is explicitly excluded. |
| `dependencies.resolved` | Yes | Array. All listed tickets must be in `COMPLETE` state. |
| `estimated_risk` | Yes | One of: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`. |
| `rollback_available` | Yes | Boolean. If `true`, `rollback_point` must be set. |
| `checkpoint_strategy` | Yes | Must reference a defined strategy in CHECKPOINT_PROTOCOL.md. |
| `acceptance_criteria` | Yes | Non-empty array. Copied from ticket. |
| `contract_locks` | No | Array of path globs. Required if CONTRACT_LOCK active. |
| `resume_packet_loaded` | Yes | Boolean. Must be `true` if resuming from interruption. |

---

## 4. Continuation Resolution (Mandatory)

Before any new execution, the system **must** run continuation resolution:

```bash
npx tsx scripts/resolve-continuation.ts
```

The resulting `CONTINUATION_DECISION` determines the next ticket. Execution **must not** begin without this resolution.

**Forbidden:** Starting execution from conversational memory, operator suggestion, or improvised selection without running the resolution script.

---

## 5. Mandatory Execution Footer

Every task execution **MUST** end with the following footer. This is non-negotiable. Omitting the footer is a protocol violation.

```yaml
EXECUTION_COMPLETE:
  protocol_version: "1.0.0"
  timestamp: "2026-05-20T02:45:00Z"
  task_id: "T3.7"
  status: "COMPLETE"            # COMPLETE | FAILED | INTERRUPTED | ROLLED_BACK
  execution_duration_minutes: 55
  files_created:
    - "tests/e2e/frontend/homepage.spec.ts"
  files_modified:
    - "playwright.config.ts"
  files_deleted: []
  validations_run:
    - name: "typecheck"
      result: "PASSED"
    - name: "test:unit"
      result: "PASSED"
    - name: "lint"
      result: "SKIPPED"
      reason: "Environmental timeout per Incidental Failure Policy"
  blockers_encountered: []
  drift_detected: false
  drift_events: []
  resumable: false              # true if INTERRUPTED; false if COMPLETE
  next_safe_action: "CLOSE_TICKET_AND_COMMIT"
  checkpoint_written: true
  checkpoint_path: "project-governance/runtime/checkpoints/T3.7-checkpoint.json"
  governance_compliant: true
  completion_report_path: "project-governance/runtime/completion-reports/T3.7-completion.yaml"
```

### 4.1 Footer Validation Rules

| Field | Required | Validation |
|-------|----------|------------|
| `status` | Yes | Must be one of the canonical states. |
| `files_created` | Yes | Array. Must match git status. |
| `files_modified` | Yes | Array. Must match git status. |
| `files_deleted` | Yes | Array. Must match git status. |
| `validations_run` | Yes | Array of `{name, result, reason?}`. `result` ∈ {`PASSED`, `FAILED`, `SKIPPED`}. |
| `blockers_encountered` | Yes | Array (may be empty). If non-empty, status must not be `COMPLETE`. |
| `drift_detected` | Yes | Boolean. If `true`, `drift_events` must be non-empty and DRIFT_RECOVERY_PROTOCOL.md invoked. |
| `resumable` | Yes | Boolean. `true` only if status is `INTERRUPTED`. |
| `next_safe_action` | Yes | Must be a defined action in GOVERNANCE_GATES.md. |
| `checkpoint_written` | Yes | Boolean. Must be `true` unless status is `FAILED` and rollback was not possible. |
| `governance_compliant` | Yes | Boolean. `true` only if all gates in GOVERNANCE_GATES.md passed. |
| `completion_report_path` | Yes | Path to completion report. Validates against `COMPLETION_REPORT_SCHEMA.md`. Required for all terminal states except `ROLLED_BACK`. |

---

## 5. State Persistence

Execution state is the single source of truth for runtime governance. It lives in:

- **Primary:** `project-governance/runtime/runtime-state.json`
- **Active execution overlay:** `project-governance/runtime/checkpoints/active-execution.md`
- **Checkpoint series:** `project-governance/runtime/checkpoints/T{task_id}-checkpoint.json`

### 5.1 State Update Rules

1. On `EXECUTION_START`: Write `active-execution.md` with the full header. **Update `runtime/state/active-execution.json`** as the canonical execution state.
2. On state transition: Append transition event to `execution-logs/mutation-log.jsonl`.
3. On `EXECUTION_COMPLETE`: Update `runtime/state/active-execution.json`, archive execution to `execution-history/`, write completion report, clear `active-execution.md`.

**Canonical runtime state:** `project-governance/runtime/state/active-execution.json`  
**Lock file:** `project-governance/runtime/state/execution-lock.json`  
**Mutation rules:** See `STATE_MUTATION_RULES.md`

### 5.2 Immutability of Historical State

Once a ticket reaches a terminal state (`COMPLETE`, `FAILED`, `ROLLED_BACK`), its execution history is immutable. Corrections must be made via new tickets, not by mutating history.

---

## 6. Enforcement

### 6.1 Violation Levels

| Violation | Example | Response |
|-----------|---------|----------|
| **Missing header** | Agent begins file modifications without `EXECUTION_START` | HALT. Require header before any work continues. |
| **Missing footer** | Agent declares "done" without `EXECUTION_COMPLETE` | HALT. Work is not complete until footer is emitted and validated. |
| **Invalid state transition** | PLANNED → EXECUTING | REJECT. Force transition through READY. |
| **False COMPLETE** | Status COMPLETE but validations FAILED | ROLLBACK. Mark FAILED, execute rollback procedure. |
| **Drift without event** | `drift_detected: true` but `drift_events: []` | HALT. Require drift classification per DRIFT_RECOVERY_PROTOCOL.md. |

### 6.2 Automation Hooks

All protocols in this directory are designed to be machine-validated. Future automation (M17) will:

- Parse `EXECUTION_START` / `EXECUTION_COMPLETE` blocks
- Validate against this schema
- Reject commits that lack footers
- Generate drift events on violations

## 7. Integration with Other Protocols

| Protocol | Integration Point |
|----------|-------------------|
| `CHECKPOINT_PROTOCOL.md` | Checkpoints persist execution state during `EXECUTING` and `CHECKPOINT_PENDING`. |
| `COMPLETION_REPORT_SCHEMA.md` | Footer generates the completion report artifact. |
| `DRIFT_RECOVERY_PROTOCOL.md` | Forbidden transitions and drift detection invoke recovery. |
| `GOVERNANCE_GATES.md` | Gates enforce header/footer validation and block invalid transitions. |
| `SAFE_EXIT_PROTOCOL.md` | Safe exit transitions execution to `INTERRUPTED` or terminal state cleanly. |
| `STATE_MUTATION_RULES.md` | State updates to `active-execution.json` follow mutation rules and lock semantics. |

---

## 8. Execution Authorization

Execution authorization is governed by `EXECUTION_AUTHORIZATION_PROTOCOL.md`.

**Rule:** No transition from `READY` to `EXECUTING` may occur without explicit authorization.  
**Rule:** Lock acquisition (the first mutation of any execution) requires authorization.  
**Rule:** Pre-execution staging (plan presentation) is permitted without authorization.  
**Rule:** Informational interactions (`status`, `explain`, etc.) never trigger execution.

---

## 9. Output Modes

Status queries support two explicit modes:

| Mode | Trigger | Format | Max Lines |
|------|---------|--------|-----------|
| **Concise** | `status` (default) | Telemetry ping: key:value pairs | 20 |
| **Detailed** | `status --detail` | Full sections: state, audit, artifacts, risks | 80 |

**Rule:** Default is always concise. Detailed mode is opt-in only. No truncation in either mode.

---

## 9. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-20 | Initial protocol. Canonical 9-state machine, mandatory header/footer. |

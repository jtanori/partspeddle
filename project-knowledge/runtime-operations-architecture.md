# Runtime Operations Architecture

> **Document Type:** Architecture Design (MODE: DESIGN)
> **Scope:** Governance runtime operational interaction model
> **Status:** Draft — pending review
> **Authority:** `meta/state/canonical-state.json` remains sole mutable runtime state
> **Date:** 2026-05-24

---

## 1. Architectural Overview

### 1.1 Core Principle

The governance runtime is a **deterministic state machine** whose transitions are driven by:

1. **Canonical state mutations** (the only mutable authority)
2. **Governance events** (append-only, causally linked)
3. **Operator commands** (validated, audited, reversible where possible)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         RUNTIME OPERATIONS ARCHITECTURE                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│  │  Operator       │────▶│  Command        │────▶│  Validation     │   │
│  │  Interface      │     │  Router         │     │  Gate           │   │
│  │  (Console/CLI)  │     │                 │     │                 │   │
│  └─────────────────┘     └─────────────────┘     └────────┬────────┘   │
│                                                           │            │
│                                                           ▼            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              CANONICAL STATE (meta/state/canonical-state.json)   │   │
│  │              ────────────── SOLE MUTABLE AUTHORITY ───────────── │   │
│  │                                                                 │   │
│  │  • execution   • milestone   • ticket   • lock   • repository  │   │
│  │  • governance  • confidence  • drift    • safe_exit            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                           │                                            │
│                           ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              PROJECTION SYNC ENGINE (auto-cascade)              │   │
│  │                                                                 │   │
│  │  runtime-state.json  →  active-execution.json                  │   │
│  │  current-milestone.json  →  current-ticket.json                │   │
│  │  execution-lock.json  →  runtime-bootstrap.json                │   │
│  │  execution-journal.ndjson  →  heartbeats/*.json                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                           │                                            │
│                           ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              OBSERVABILITY LAYER (append-only)                  │   │
│  │                                                                 │   │
│  │  • Execution Journal  • Heartbeats  • Monitor Reports          │   │
│  │  • Drift Events       • Audit Log   • Governance Events        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Authority Hierarchy

| Layer | Mutable? | Source of Truth | Consumers |
|-------|----------|-----------------|-----------|
| **Canonical State** | ✅ Yes | `meta/state/canonical-state.json` | All projections, bootstrap, queries |
| **Projections** | ❌ No | Derived from canonical-state | Runtime scripts, CI, operators |
| **Event Journal** | ❌ No | Append-only log | Replay, forensics, audit |
| **Observability** | ❌ No | Derived from events | Humans, monitors, dashboards |
| **Command Output** | ❌ No | Ephemeral | Operator terminal, CI logs |

### 1.3 Design Constraints

- **Never** write to a projection file directly.
- **Always** mutate canonical-state first, then trigger sync.
- **Always** emit a governance event for every state transition.
- **Never** allow a command to mutate state without a validation gate.
- **Always** produce deterministic output (same state → same projection).

---

## 2. Component Model

### 2.1 Runtime Command Surface (`runtime-cmd`)

A unified command router that exposes all operational capabilities through a consistent interface.

```typescript
interface RuntimeCommand {
  id: string;                    // "execution.lock.acquire"
  version: string;               // "1.0.0"
  authority: "operator" | "agent" | "ci" | "scheduler";
  ticket?: string;               // Contextual ticket ID
  payload: Record<string, unknown>;
  dry_run?: boolean;             // Validate without mutating
}

interface RuntimeCommandResult {
  command_id: string;
  status: "success" | "failure" | "dry_run_valid";
  canonical_state_delta?: Record<string, unknown>;
  projections_updated: string[];
  events_emitted: string[];
  validation_gate: string;
  timestamp: string;
}
```

**Command Taxonomy:**

| Namespace | Commands | Authority Required |
|-----------|----------|-------------------|
| `execution.*` | `lock`, `unlock`, `freeze`, `resume`, `checkpoint` | `agent` or `operator` |
| `milestone.*` | `activate`, `close`, `evaluate`, `block` | `operator` |
| `ticket.*` | `create`, `start`, `complete`, `abort`, `review` | `agent` or `operator` |
| `invariant.*` | `validate`, `monitor`, `report`, `suppress` | `operator` |
| `storage.*` | `health`, `read`, `write`, `migrate`, `benchmark` | `agent` or `operator` |
| `query.*` | `status`, `drift`, `history`, `projections`, `events` | Any |
| `recovery.*` | `reconcile`, `replay`, `rebuild`, `audit` | `operator` |

### 2.2 Governance Mode Registry

A formal registry of runtime operational modes. Every session begins in a mode.

```typescript
type RuntimeMode =
  | "IDLE"              // No active execution; awaiting instruction
  | "PLAN"              // Planning mode; architecture decisions pending
  | "EXECUTE"           // Ticket execution in progress
  | "VALIDATE"          // Validation sweep running
  | "INVESTIGATE"       // Root-cause analysis active
  | "RECONCILE"         // Drift repair in progress
  | "RECOVER"           // Recovery mode; execution frozen
  | "FREEZE"            // Emergency freeze; no advancement
  | "REVIEW"            // Human review gate
  | "COMMIT"            // Commit phase
  | "RELEASE"           // Lock release and cleanup
  | "STATUS";           // Read-only inspection

interface ModeDefinition {
  mode: RuntimeMode;
  allowed_commands: string[];
  forbidden_commands: string[];
  entry_gate: string;       // Invariant ID required to enter
  exit_gate: string;        // Invariant ID required to exit
  auto_timeout_minutes?: number;
  on_timeout: "freeze" | "release" | "alert";
}
```

**Mode Transition Matrix:**

```
         IDLE ──▶ PLAN ──▶ EXECUTE ──▶ VALIDATE ──▶ COMMIT ──▶ RELEASE ──▶ IDLE
          │        │         │            │           │           │
          │        │         ▼            ▼           ▼           │
          │        │      INVESTIGATE  RECONCILE   REVIEW        │
          │        │         │            │           │           │
          │        │         └────▶ RECOVER ◀───────┘           │
          │        │              (supersedes all)                │
          │        │                                              │
          └────────┴──────────────────────────────────────────────┘
                    (STATUS is orthogonal; readable from any mode)
```

### 2.3 Operator Console Semantics

A structured human interface that provides:

1. **Status Overview** — One-glance system health
2. **Command Prompt** — Validated, context-aware command input
3. **Event Stream** — Real-time governance events
4. **Projection Panel** — Current runtime projections
5. **History Navigator** — Execution journal browsing

**Console Output Format:**

```text
╔══════════════════════════════════════════════════════════════╗
║  VINTRACK GOVERNANCE CONSOLE    mode: IDLE   ticket: —      ║
╠══════════════════════════════════════════════════════════════╣
║  Milestone: M28 (completed)   Last: T28.3 complete          ║
║  Lock: FREE   Commit: 013de71   Invariants: 22/22 ✅        ║
╠══════════════════════════════════════════════════════════════╣
║  Drift: NONE   Bootstrap: STALE   Health: DEGRADED          ║
╠══════════════════════════════════════════════════════════════╣
║  > _                                                         ║
╚══════════════════════════════════════════════════════════════╝
```

### 2.4 Execution Journal System

An append-only journal that records every significant runtime action for deterministic replay.

```typescript
interface ExecutionJournalEntry {
  sequence_id: number;           // Global monotonic sequence
  timestamp: string;             // ISO 8601
  execution_id?: string;         // Contextual execution
  ticket_id?: string;
  milestone_id?: string;
  actor: "agent" | "operator" | "ci" | "system";
  action: string;                // "state.mutated", "lock.acquired", etc.
  subject: string;               // canonical-state, projection, event
  before_hash: string;           // SHA-256 of state before
  after_hash: string;            // SHA-256 of state after
  delta: Record<string, unknown>;// Structured diff
  validation_result: string;     // Gate that was passed
  governance_event_id: string;   // Link to emitted event
}
```

**Journal Storage:**
- Primary: `project-governance/runtime/execution-journal/YYYY-MM.ndjson`
- Retention: 90 days online, archive to `project-governance/runtime/archive/`
- Integrity: Each entry includes hash chain (previous entry's after_hash)

### 2.5 Checkpoint Replay Infrastructure

```typescript
interface Checkpoint {
  checkpoint_id: string;         // cp_{ticket}_{timestamp}_{status}
  ticket_id: string;
  milestone_id: string;
  execution_id: string;
  status: "active" | "complete" | "aborted";
  canonical_state_snapshot: Record<string, unknown>;
  journal_sequence_range: [number, number]; // First and last sequence
  artifact_manifest: string[];   // Files that changed
  created_at: string;
  updated_at: string;
  preceding_checkpoint: string;  // Chain link
  replay_hash: string;           // Deterministic hash of replayable state
}
```

**Replay Protocol:**

1. Load checkpoint canonical-state snapshot
2. Replay journal entries from `checkpoint.journal_sequence_range[1] + 1` to target
3. Verify each step's `after_hash` matches recomputed state
4. If hash mismatch → halt, emit `replay.integrity_failure`, enter INVESTIGATE

### 2.6 State Projection Layer

A declarative projection engine that auto-generates all derived state files from canonical-state.

```typescript
interface ProjectionDefinition {
  id: string;                    // "runtime-state", "active-execution"
  output_path: string;
  schema: string;                // JSON Schema URL
  generator: string;             // Script path
  dependencies: string[];        // Other projections this depends on
  refresh_trigger: "canonical_state_change" | "scheduled" | "manual";
  max_staleness_ms: number;      // Before alert
}
```

**Registered Projections:**

| Projection | Output Path | Refresh Trigger | Max Staleness |
|-----------|-------------|-----------------|---------------|
| runtime-state | `project-governance/runtime/runtime-state.json` | canonical_state_change | 60s |
| active-execution | `project-governance/runtime/state/active-execution.json` | canonical_state_change | 60s |
| current-milestone | `project-governance/runtime/state/current-milestone.json` | canonical_state_change | 60s |
| current-ticket | `project-governance/runtime/state/current-ticket.json` | canonical_state_change | 60s |
| execution-lock | `project-governance/runtime/state/execution-lock.json` | canonical_state_change | 60s |
| runtime-bootstrap | `project-governance/runtime/bootstrap/runtime-bootstrap.json` | canonical_state_change | 300s |
| repository-status | `meta/state/repository-status.json` | git_hook | 60s |

**Projection Sync Protocol:**

```
canonical-state mutation
        │
        ▼
┌───────────────────┐
│ emit governance   │
│ event: state.     │
│ projection_sync_  │
│ required          │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ projection engine │
│ reads canonical-  │
│ state, generates  │
│ all projections   │
│ atomically        │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ invariant:        │
│ validate          │
│ (projection-      │
│ consistency)      │
└─────────┬─────────┘
          │
     PASS │ FAIL
          │
    ┌─────┴─────┐
    ▼           ▼
┌───────┐   ┌───────────┐
│ done  │   │ reconcile │
└───────┘   └───────────┘
```

### 2.7 Runtime Query Interface

A read-only query surface for operators, agents, and CI.

```typescript
interface RuntimeQuery {
  type: "status" | "drift" | "history" | "projections" | "events" | "checkpoints";
  filter?: {
    ticket?: string;
    milestone?: string;
    execution?: string;
    time_range?: [string, string];
    severity?: string[];
  };
  format: "table" | "json" | "csv" | "ndjson";
}
```

**Query Commands (npm scripts):**

```bash
# System status
npm run query:status              # One-glance overview
npm run query:drift               # Current drift report
npm run query:projections         # All projections with staleness
npm run query:health              # Aggregate health score

# History and replay
npm run query:history -- --ticket T28.3
npm run query:events -- --severity CRITICAL,HIGH
npm run query:checkpoints -- --milestone M28
npm run query:journal -- --execution EXEC-2026-05-24-008

# Governance
npm run query:invariants          # Invariant registry + last run
npm run query:locks               # Lock history and current state
npm run query:milestones          # Milestone registry + status
```

### 2.8 Structured Reporting Engine

Deterministic, schema-validated reports for every operational phase.

```typescript
interface RuntimeReport {
  report_id: string;
  report_type: "status" | "validation" | "drift" | "incident" | "audit";
  generated_at: string;
  generated_by: string;
  format_version: string;
  canonical_state_hash: string;  // Hash of canonical-state at generation time
  findings: ReportFinding[];
  recommendations: string[];
  next_actions: string[];
}

interface ReportFinding {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  category: string;
  description: string;
  evidence: Record<string, unknown>;
  auto_recoverable: boolean;
  remediation?: string;
}
```

**Report Types:**

| Report | Trigger | Output |
|--------|---------|--------|
| `status` | `npm run report:status` | Console + `project-governance/runtime/reports/status-{timestamp}.md` |
| `validation` | Post-validation gate | `project-governance/runtime/reports/validation-{ticket}.md` |
| `drift` | `npm run report:drift` | `project-governance/runtime/reports/drift-{timestamp}.md` |
| `incident` | On anomaly detection | `project-governance/runtime/reports/incident-{id}.md` |
| `audit` | Scheduled or manual | `project-governance/runtime/audits/integrity-audit-{timestamp}.json` |

### 2.9 Incident Recovery Framework

```typescript
interface Incident {
  incident_id: string;           // INCIDENT-{date}-{sequence}
  detected_at: string;
  detected_by: string;           // invariant, monitor, operator, ci
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: "drift" | "lock" | "state" | "replay" | "projection" | "security";
  description: string;
  affected_projections: string[];
  root_cause?: string;
  recovery_mode: "auto" | "manual" | "freeze";
  recovery_actions: RecoveryAction[];
  status: "open" | "recovering" | "resolved" | "closed";
  resolved_at?: string;
}

interface RecoveryAction {
  sequence: number;
  action: string;
  requires_authority: "agent" | "operator" | "ci";
  validation_gate?: string;
  completed_at?: string;
  result?: "success" | "failure" | "skipped";
}
```

**Recovery Lifecycle:**

```
DETECT ──▶ CLASSIFY ──▶ FREEZE (if CRITICAL) ──▶ INVESTIGATE ──▶ PLAN ──▶ REPAIR ──▶ VALIDATE ──▶ RESUME
   │           │              │                      │           │         │           │           │
   │           │              │                      │           │         │           │           │
   ▼           ▼              ▼                      ▼           ▼         ▼           ▼           ▼
[emit]    [emit]         [emit]                 [emit]      [emit]    [emit]      [emit]      [emit]
event:    event:         event:                 event:      event:    event:      event:      event:
incident. incident.      execution.             recovery.   recovery. recovery.   recovery.   execution.
detected  classified     freeze_activated       investigation plan      repair      validation  resume
```

### 2.10 Deterministic Resume Protocols

**Protocol: `RESUME_FROM_CHECKPOINT`**

```
1. READ latest-checkpoint.json
   └─ If missing → read canonical-state, infer from execution block

2. VALIDATE checkpoint integrity
   └─ Hash chain verification
   └─ Invariant validation against checkpoint snapshot

3. DETERMINE resume mode
   ├─ checkpoint.status = "active" → RESUME_EXECUTION
   ├─ checkpoint.status = "complete" → RESUME_NEXT_TICKET
   └─ checkpoint.status = "aborted" → RESUME_INVESTIGATE

4. SYNCHRONIZE projections
   └─ Run projection sync engine
   └─ Validate all projections against canonical-state

5. EMIT resume event
   └─ event: execution.resumed
   └─ Include checkpoint_id, resume_mode, projections_validated

6. ENTER execution mode
   └─ Acquire lock
   └─ Begin ticket work
```

**Protocol: `RESUME_FROM_INTERRUPTION`**

```
1. DETECT interruption type
   ├─ Context loss → Use checkpoint + journal replay
   ├─ Execution pause → Use active checkpoint
   └─ System crash → Use latest complete checkpoint

2. VERIFY no split-brain
   └─ Check lock state
   └─ If locked by another execution → ENTER_RECONCILE

3. REPLAY journal from checkpoint
   └─ Incremental state reconstruction
   └─ Hash validation at each step

4. RESTORE execution context
   └─ Load ticket, milestone, execution_id
   └─ Validate against canonical-state

5. RESUME from last successful phase
   └─ Do NOT restart from planning
   └─ Continue from latest phase checkpoint
```

---

## 3. Runtime Lifecycle

### 3.1 Lifecycle States

```
BOOTSTRAP ──▶ IDLE ──▶ PLAN ──▶ EXECUTE ──▶ VALIDATE ──▶ COMMIT ──▶ RELEASE ──▶ ARCHIVE
                │        │         │            │           │           │           │
                │        │         ▼            ▼           ▼           ▼           │
                │        │      INVESTIGATE  RECONCILE   REVIEW      RECOVER       │
                │        │         │            │           │           │           │
                │        │         └────────────┴───────────┴───────────┘           │
                │        │                                                          │
                └────────┴──────────────────────────────────────────────────────────┘
                                    (STATUS readable from any state)
```

### 3.2 State Entry/Exit Gates

| State | Entry Gate | Exit Gate | Timeout |
|-------|-----------|-----------|---------|
| BOOTSTRAP | `system.ready` | `projections.synced` | 60s |
| IDLE | `lock.released` | `ticket.approved` | ∞ |
| PLAN | `ticket.approved` | `plan.validated` | 30 min |
| EXECUTE | `plan.validated` | `deliverables.complete` | 4h |
| VALIDATE | `deliverables.complete` | `all_gates.pass` | 30 min |
| INVESTIGATE | `gate.failure` | `root_cause.identified` | 2h |
| RECONCILE | `drift.detected` | `projections.synced` | 1h |
| COMMIT | `all_gates.pass` | `commit.pushed` | 15 min |
| REVIEW | `commit.pushed` | `review.approved` | 24h |
| RELEASE | `commit.pushed` or `review.approved` | `lock.released` | 5 min |
| RECOVER | `incident.critical` | `recovery.validated` | 4h |
| ARCHIVE | `execution.complete` | `artifacts.archived` | 5 min |

---

## 4. Governance Interaction Model

### 4.1 Actor Roles

| Actor | Authority | Commands | Constraints |
|-------|-----------|----------|-------------|
| **Agent** | `agent` | `execution.*`, `ticket.*`, `storage.*`, `query.*` | Must hold lock; cannot activate milestones |
| **Operator** | `operator` | All commands | Must authenticate; cannot bypass invariant gates |
| **CI** | `ci` | `invariant.*`, `query.*`, `storage.*` | Read-only except invariant validation |
| **Scheduler** | `scheduler` | `invariant.monitor`, `query.status` | Cannot mutate state |
| **System** | `system` | Auto-recovery actions | Only for auto-recoverable findings |

### 4.2 Decision vs. Command

| Type | Mutable State? | Audit Trail | Reversibility |
|------|---------------|-------------|---------------|
| **Governance Decision** | Yes (canonical-state) | Event + journal | Must be replayable |
| **Operational Command** | Maybe (via decision) | Event | Validated before execution |
| **Query** | No | Log entry | N/A |
| **Report** | No | Read-only | N/A |

**Decision Flow:**

```
Operator proposes decision
        │
        ▼
┌───────────────────┐
│ Validation Gate   │
│ (invariant check) │
└─────────┬─────────┘
          │
     PASS │ FAIL
          │
    ┌─────┴─────┐
    ▼           ▼
┌───────┐   ┌───────────┐
│ Emit  │   │ Emit      │
│ event:│   │ event:    │
│ decis-│   │ decision. │
│ ion.  │   │ rejected  │
│ appro-│   └───────────┘
│ ved   │
└───┬───┘
    │
    ▼
┌───────────────────┐
│ Mutate canonical- │
│ state             │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Sync projections  │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Emit event:       │
│ state.projections │
│ _synced           │
└───────────────────┘
```

---

## 5. Human Operational Model

### 5.1 Operator Workflow: Start Execution

```bash
# 1. Check system status
$ npm run query:status

# 2. Validate no active lock
$ npm run query:locks

# 3. Review next ticket
$ npm run query:tickets -- --status planned --milestone M29

# 4. Acquire execution lock
$ npm run execution:lock -- --ticket T29.1 --reason "Starting implementation"

# 5. Enter execute mode
$ npm run execution:start -- --ticket T29.1

# 6. Work on ticket...

# 7. Emit checkpoint
$ npm run execution:checkpoint -- --status active

# 8. Complete deliverables
$ npm run execution:complete -- --ticket T29.1

# 9. Validation sweep
$ npm run validate:all

# 10. Commit
$ git add -A && git commit -m "feat(...): ... (T29.1)"

# 11. Release lock
$ npm run execution:release -- --reason "T29.1 complete"
```

### 5.2 Operator Workflow: Recovery

```bash
# 1. Detect anomaly
$ npm run query:drift

# 2. If critical drift, system auto-freezes
#    Or manual freeze:
$ npm run execution:freeze -- --reason "Investigating drift"

# 3. Investigate
$ npm run query:history -- --time-range "last 24h"
$ npm run query:events -- --severity CRITICAL,HIGH

# 4. Reconcile
$ npm run recovery:reconcile

# 5. Validate
$ npm run invariant:validate

# 6. Resume
$ npm run execution:resume -- --from checkpoint
```

### 5.3 Operator Workflow: Interruption Recovery

```bash
# 1. Bootstrap (reads canonical-state, not projections)
$ npm run bootstrap

# 2. Check latest checkpoint
$ npm run query:checkpoints -- --latest

# 3. Validate projections
$ npm run query:projections

# 4. If projections stale, sync them
$ npm run projection:sync

# 5. Resume from checkpoint
$ npm run execution:resume -- --checkpoint cp_T29.1_...
```

---

## 6. Failure Recovery Semantics

### 6.1 Failure Taxonomy

| Failure | Detection | Auto-Recovery | Manual Recovery |
|---------|-----------|---------------|-----------------|
| Projection drift | `invariant:validate` | `projection:sync` | `recovery:reconcile` |
| Lock expiry | `detect-stale-locks` | `lock:release` | `execution:release` |
| Checkpoint corruption | `checkpoint:validate` | Use preceding checkpoint | `recovery:replay` |
| Journal gap | `journal:validate` | None | `recovery:rebuild` |
| Bootstrap failure | `bootstrap:validate` | None | Fix bootstrap script |
| Invariant violation | `invariant:validate` | If auto-recoverable | `recovery:investigate` |
| Context loss | `resume:validate` | `resume:from-checkpoint` | `recovery:replay` |
| Split-brain | `lock:validate` | None | `recovery:reconcile` |

### 6.2 Recovery Action Priority

```
P0: Freeze execution (prevent further damage)
P1: Preserve evidence (journal, checkpoints, state)
P2: Classify failure (taxon + severity)
P3: Attempt auto-recovery (if safe)
P4: Human investigation (if auto-recovery fails)
P5: Repair and validate
P6: Resume execution
```

---

## 7. Scalability Analysis

### 7.1 Current Scale

| Metric | Current | Limit | Headroom |
|--------|---------|-------|----------|
| Invariants | 22 | 100 | 78 |
| Checkpoints | ~15 | 1000 | 985 |
| Journal entries/mo | ~500 | 10000 | 9500 |
| Projections | 7 | 20 | 13 |
| Milestones | 35 | 100 | 65 |
| Tickets | ~100 | 500 | 400 |
| Governance events/mo | ~200 | 5000 | 4800 |

### 7.2 Scaling Vectors

| Vector | Bottleneck | Mitigation |
|--------|-----------|------------|
| More invariants | Validation time | Parallel validation, severity filtering |
| More checkpoints | Storage size | Archive to compressed artifacts |
| Larger journal | Query time | Indexed journal, monthly sharding |
| More projections | Sync time | Incremental sync, dependency graph |
| Concurrent executions | Lock contention | Distributed lock adapter (future) |

---

## 8. Migration Strategy

### 8.1 From Current State to Target Architecture

**Phase 1: Projection Sync (Immediate — P0)**
- [ ] Implement `scripts/sync-projections.ts`
- [ ] Add `npm run projection:sync`
- [ ] Fix `scripts/bootstrap.ts` to read from registry + canonical-state
- [ ] Update canonical-state `repository` fields in commit hook
- [ ] Add `bench/` to `.gitignore`

**Phase 2: Journal & Observability (P1)**
- [ ] Implement execution journal appender
- [ ] Add heartbeat emission to `execution:lock`, `execution:release`
- [ ] Create monitor report persistence
- [ ] Add `npm run query:*` commands

**Phase 3: Console & Reporting (P2)**
- [ ] Implement structured reporting engine
- [ ] Add `npm run report:*` commands
- [ ] Create operator console wrapper
- [ ] Document operator runbook

**Phase 4: CI Integration (P2)**
- [ ] Add `storage:test` to CI workflow
- [ ] Add benchmark regression gate
- [ ] Add projection sync validation to CI
- [ ] Add bootstrap validation to CI

**Phase 5: Mode Registry (P3)**
- [ ] Implement mode registry JSON
- [ ] Add mode transition validation
- [ ] Add mode-aware command routing
- [ ] Document mode semantics

### 8.2 Backward Compatibility

- Canonical-state schema remains unchanged
- Existing checkpoints remain valid
- Existing npm scripts remain functional
- New commands are additive
- Projections can be regenerated on demand

---

## 9. Recommended Milestone Structure

### M29 — Event Causality & Replay Integrity (Already planned)

**In scope:**
- Global event sequence IDs
- Causality chain implementation
- Replay integrity validator

**Dependency on this design:**
- Execution journal system (Phase 2) provides foundation for event causality

### M30 — Architecture Mapping (Already planned)

**In scope:**
- Surface mapping
- Import direction enforcement
- Contract boundary validation

### M31 — Deployment Governance (Already planned)

**In scope:**
- Deployment readiness gates
- Environment promotion
- Rollback procedures

### **New: M32 — Runtime Operations Platform**

**Purpose:** Implement the architecture described in this document.

**Tickets:**

| Ticket | Title | Phase | Dependencies |
|--------|-------|-------|-------------|
| T32.1 | Projection Sync Engine | Phase 1 | M28 |
| T32.2 | Bootstrap Rewrite | Phase 1 | T32.1 |
| T32.3 | Execution Journal System | Phase 2 | M29 |
| T32.4 | Heartbeat & Monitor Infrastructure | Phase 2 | T32.3 |
| T32.5 | Runtime Query Interface | Phase 3 | T32.1 |
| T32.6 | Structured Reporting Engine | Phase 3 | T32.5 |
| T32.7 | Operator Console | Phase 3 | T32.5, T32.6 |
| T32.8 | CI Hardening & Gates | Phase 4 | T32.1, T32.3 |
| T32.9 | Governance Mode Registry | Phase 5 | T32.1, T32.3 |
| T32.10 | Documentation & Runbook | Phase 3 | T32.7 |

**Exit criteria:**
- All projections auto-sync within 60s of canonical-state mutation
- Bootstrap produces accurate state from canonical-state
- Execution journal captures every significant action
- Operator can query full system status in one command
- CI validates projections, storage, and bootstrap on every push
- Mode registry governs all runtime transitions

---

## 10. Execution Readiness Assessment

### 10.1 Readiness for M29 Activation

| Criterion | Status | Blocker |
|-----------|--------|---------|
| M28 dependency satisfied | ✅ Yes | — |
| Storage adapter operational | ✅ Yes | — |
| Invariant system active | ✅ Yes | — |
| Checkpoint lineage intact | ✅ Yes | — |
| Bootstrap produces accurate state | ❌ No | **BLOCKER** |
| Projections synchronized | ❌ No | **BLOCKER** |
| Execution journal present | ❌ No | — |
| Operator can query status | ❌ No | — |

**Verdict:** 🔴 **NOT READY for M29 activation.**

**Required before M29:**
1. Fix bootstrap script (T32.1 + T32.2)
2. Implement projection sync (T32.1)

**Can proceed in parallel with M29:**
- Execution journal (T32.3) — M29's event causality work overlaps with this
- Heartbeat infrastructure (T32.4)

### 10.2 Recommended Immediate Actions

1. **Create tickets T32.1 and T32.2** (or equivalent prep work)
2. **Implement projection sync engine** — highest priority
3. **Fix bootstrap script** — second highest priority
4. **Then activate M29**

---

## Appendix A: Governance Event Taxonomy

| Event Type | Category | Severity | Emitted By |
|-----------|----------|----------|-----------|
| `execution.started` | execution | info | execution:start |
| `execution.completed` | execution | info | execution:complete |
| `execution.frozen` | execution | warning | execution:freeze |
| `execution.resumed` | execution | info | execution:resume |
| `lock.acquired` | lock | info | execution:lock |
| `lock.released` | lock | info | execution:release |
| `lock.expired` | lock | high | detect-stale-locks |
| `state.mutated` | state | info | Any state mutation |
| `state.projections_synced` | state | info | projection:sync |
| `checkpoint.created` | checkpoint | info | execution:checkpoint |
| `checkpoint.validated` | checkpoint | info | checkpoint:validate |
| `invariant.violation` | invariant | high | validate-invariants |
| `invariant.validation_complete` | invariant | info | validate-invariants |
| `drift.detected` | drift | warning | query:drift |
| `drift.repaired` | drift | info | recovery:reconcile |
| `incident.detected` | incident | critical | Any anomaly |
| `incident.resolved` | incident | info | recovery:repair |
| `decision.approved` | governance | info | governance decision |
| `decision.rejected` | governance | warning | governance decision |
| `bootstrap.completed` | bootstrap | info | bootstrap |
| `bootstrap.failed` | bootstrap | high | bootstrap |

---

## Appendix B: Schema Registry

| Schema | Path | Status |
|--------|------|--------|
| Canonical State | `meta/governance/schemas/governance-state.schema.json` | ✅ Exists |
| Checkpoint | `meta/governance/schemas/checkpoint.schema.json` | ✅ Exists |
| Invariant | `meta/governance/invariants/invariant.schema.json` | ✅ Exists |
| Governance Event | `meta/governance/schemas/governance-event.schema.json` | 🟡 Needed |
| Execution Journal Entry | `meta/governance/schemas/journal-entry.schema.json` | 🟡 Needed |
| Runtime Mode | `meta/governance/schemas/runtime-mode.schema.json` | 🟡 Needed |
| Runtime Command | `meta/governance/schemas/runtime-command.schema.json` | 🟡 Needed |
| Runtime Report | `meta/governance/schemas/runtime-report.schema.json` | 🟡 Needed |
| Projection Definition | `meta/governance/schemas/projection.schema.json` | 🟡 Needed |
| Incident | `meta/governance/schemas/incident.schema.json` | 🟡 Needed |

---

## Appendix C: File Layout

```
project-governance/runtime/
├── bootstrap/
│   └── runtime-bootstrap.json          (derived — auto-generated)
├── checkpoints/
│   ├── checkpoint-schema.json
│   ├── latest-checkpoint.json
│   ├── cp_T{ticket}_{timestamp}_{status}.json
│   └── archive/
├── state/
│   ├── active-execution.json           (derived)
│   ├── current-milestone.json          (derived)
│   ├── current-ticket.json             (derived)
│   └── execution-lock.json             (derived)
├── execution-journal/
│   └── 2026-05.ndjson                  (append-only)
├── heartbeats/
│   └── heartbeat-{timestamp}.json      (append-only)
├── monitor-reports/
│   └── monitor-report-{id}.json        (append-only)
├── drift-events/
│   └── drift-{timestamp}.json          (append-only)
├── execution-logs/
│   └── execution-{id}.ndjson           (append-only)
├── execution-history/
│   └── history-{ticket}.ndjson         (append-only)
├── reports/
│   ├── status-{timestamp}.md
│   ├── validation-{ticket}.md
│   ├── drift-{timestamp}.md
│   └── incident-{id}.md
├── audits/
│   └── integrity-audit-{timestamp}.json
├── locks/
│   └── locks.ndjson                    (append-only)
├── storage/
│   ├── ROLLBACK.md
│   └── tests/
├── diagnostics/
├── enforcement/
├── healing/
├── telemetry/
├── replay/
├── state-machine/
├── recipes/
├── deployment/
└── archive/

meta/
└── state/
    └── canonical-state.json            (SOLE MUTABLE AUTHORITY)

meta/governance/
├── invariants/
│   ├── invariant.schema.json
│   └── invariants.json
├── protocols/
│   └── ...                             (runtime protocols)
├── schemas/
│   └── ...                             (schema definitions)
└── registries/
    └── ...                             (protocol, schema registries)

scripts/
├── runtime-storage.ts                  (storage adapter)
├── validate-invariants.ts              (invariant engine)
├── invariant-monitor.ts                (continuous monitor)
├── detect-stale-locks.ts               (stale lock detector)
├── sync-projections.ts                 (🟡 NEEDED)
├── emit-governance-event.ts            (event emitter)
├── query-governance-events.ts          (event query)
├── bootstrap.ts                        (bootstrap — needs rewrite)
└── runtime-console.ts                  (🟡 NEEDED — operator console)
```

---

## Document Control

| Field | Value |
|-------|-------|
| **Document ID** | `ROA-2026-05-24-001` |
| **Version** | `1.0.0` |
| **Status** | `Draft` |
| **Author** | `agent` |
| **Review Required** | `operator` |
| **Ticket** | `T32-prep` (informal) |
| **Dependencies** | `M28` (completed) |

---

```
DESIGN_COMPLETE
ARCHITECTURE_DOCUMENTED
COMPONENTS_DEFINED
LIFECYCLE_SPECIFIED
MIGRATION_PLANNED
READINESS_ASSESSED
```

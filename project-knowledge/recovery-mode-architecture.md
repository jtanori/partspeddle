---
authority:
  level: architecture
  layer: 1
  canonical: false
  derives_from:
    - runtime-governance-kernel.md
    - meta/governance/protocols/operational-mode.json
    - meta/governance/protocols/execution-freeze.json
    - meta/governance/protocols/authority-reconstruction.json
    - meta/governance/protocols/drift-classification.json
    - meta/governance/protocols/repair-contract.json
    - meta/governance/protocols/integrity-validation.json
  scope: recovery
  status: active
  version: 1.0.0
---

# Recovery Mode Architecture

> **Architecture Specification**  
> Location: `project-knowledge/recovery-mode-architecture.md`  
> Purpose: Define first-class recovery and reconciliation operational modes for the VINTRACK governance runtime.

---

## 1. Executive Summary

This document specifies the architecture for introducing first-class recovery and reconciliation operational modes into the VINTRACK governance runtime. The goal is to eliminate undefined recovery behavior and establish deterministic, auditable orchestration repair procedures.

**Status:** Architecture defined, protocols specified, schemas validated.  
**Scope:** Operational mode registry, execution freeze semantics, authority reconstruction, drift classification, deterministic repair contracts, integrity validation.  
**Out of Scope:** Implementation of recovery scripts, manual state repair, runtime hotfixing, ticket advancement.

---

## 2. Operational Mode Registry

### 2.1 Mode Categories

The runtime recognizes two mode categories:

| Category | Authority Level | Purpose |
|----------|----------------|---------|
| **NORMAL** | 1–2 | Execute ticket work within constrained behavioral boundaries |
| **RECOVERY** | 8–10 | Suspend execution authority to perform deterministic repair |

**Authority Precedence:** RECOVERY > NORMAL. Recovery modes automatically supersede all execution authority.

### 2.2 Normal Modes (Existing)

| Mode | Authority | Purpose |
|------|-----------|---------|
| `GOVERNANCE` | 1 | Planning, architecture review |
| `IMPLEMENTATION` | 1 | Deterministic ticket execution |
| `REVIEW` | 1 | Validation and QA |
| `REFACTOR` | 1 | Constrained refactor |
| `INCIDENT` | 2 | Debugging and failure recovery |
| `MIGRATION` | 1 | Structural change with oversight |

### 2.3 Recovery Modes (New)

| Mode | Authority | Purpose | Entry Point |
|------|-----------|---------|-------------|
| `RECONCILE` | 10 | Canonical recovery entrypoint | Direct from any NORMAL mode via freeze |
| `GOVERNANCE_REPAIR` | 9 | Repair governance configuration | Via RECONCILE |
| `STATE_RECOVERY` | 9 | Recover persistence-layer integrity | Via RECONCILE |
| `PROJECTION_REBUILD` | 8 | Recompute derived state artifacts | Via RECONCILE |

### 2.4 Mode Registry Specification

**Canonical Protocol:** `meta/governance/protocols/operational-mode.json`  
**Schema:** `meta/governance/schemas/operational-mode.schema.json`

Each mode defines:
- `mode_id` and `mode_category`
- `authority_level` (integer, total order)
- `allowed` operations (explicit whitelist)
- `forbidden` operations (explicit blacklist)
- `entry_conditions` and `exit_conditions`
- `behavior` descriptor

### 2.5 Key Invariants

- `mode-mutual-exclusivity`: Exactly one mode active at any time
- `recovery-mode-supremacy`: RECOVERY category → execution authority suspended
- `mode-transition-validity`: All transitions must be in the transition matrix
- `freeze-required-for-recovery`: NORMAL → RECOVERY requires confirmed freeze

---

## 3. Execution Freeze Protocol

### 3.1 Freeze State Machine

```
UNFROZEN → FREEZE_INITIATED → FROZEN → THAW_INITIATED → THAWED → UNFROZEN
                ↓                  ↑         ↓
            (abort)          (integrity fail)
```

**States:**
- `UNFROZEN`: Normal operations, execution authority active
- `FREEZE_INITIATED`: Freeze signal emitted, guarantees not yet confirmed
- `FROZEN`: All guarantees active, recovery may proceed
- `THAW_INITIATED`: Recovery complete, integrity validation in progress
- `THAWED`: Integrity passed, ready to resume normal operations

### 3.2 Mandatory Freeze Guarantees

Before `FROZEN` is confirmed, all six guarantees must be active:

| Guarantee | Severity | Verification |
|-----------|----------|--------------|
| `no_ticket_advancement` | CRITICAL | All ticket JSONs have stable status |
| `no_autonomous_execution` | CRITICAL | Autonomous execution flag = false |
| `no_lock_acquisition` | CRITICAL | Lock acquisition blocked |
| `checkpoint_mutation_requires_audit` | HIGH | Checkpoint audit required flag = true |
| `no_runtime_progression` | CRITICAL | Runtime progression blocked |
| `event_stream_append_only` | HIGH | Event stream mutation blocked |

### 3.3 Thaw Procedure

1. Integrity validation suite executed (blocking)
2. All recovery exit criteria satisfied (blocking)
3. Recovery audit finalized and appended to journal (blocking)
4. Thaw authorization emitted (blocking)
5. Freeze guarantees released in reverse order
6. Mode transition to NORMAL emitted (blocking)
7. Post-thaw checkpoint emitted (blocking)

### 3.4 Canonical Protocol

**Protocol:** `meta/governance/protocols/execution-freeze.json`  
**Schema:** `meta/governance/schemas/execution-freeze.schema.json`

---

## 4. Authority Reconstruction Framework

### 4.1 Trust Hierarchy

Ordered from highest to lowest authority:

| Rank | Source | Mutability | Confidence |
|------|--------|------------|------------|
| 1 | Append-only journal | Immutable | Absolute |
| 2 | Immutable checkpoints | Immutable after creation | High |
| 3 | Transition logs | Append-only | High |
| 4 | Canonical state | Mutable | Medium |
| 5 | Runtime memory | Mutable | Low |
| 6 | Projections/cache | Mutable | Lowest |

**Rule:** Lower-authority sources are derived from higher-authority sources. In conflicts, higher rank wins.

### 4.2 Reconstruction Procedure (6 Phases)

1. **Journal Replay** — Replay all events in timestamp order
2. **Checkpoint Anchor** — Select most recent valid checkpoint
3. **Transition Replay** — Apply transitions from checkpoint to present
4. **Canonical Reconcile** — Reconcile with canonical-state.json (overridden by higher authorities)
5. **Runtime Derive** — Rebuild runtime surfaces from canonical state
6. **Projection Rebuild** — Recompute all projections idempotently

### 4.3 Conflict Resolution Rules

- `higher_authority_wins`: Higher-ranked source is authoritative
- `journal_trumps_all`: Journal is ultimate source of truth
- `checkpoint_anchor_validity`: Checkpoints must validate against schema and have unbroken lineage
- `gap_detection`: Gaps flagged as HIGH drift, reconstruction proceeds with gap events
- `canonical_state_derived`: canonical-state.json may be rebuilt from higher authorities

### 4.4 Canonical Protocol

**Protocol:** `meta/governance/protocols/authority-reconstruction.json`

---

## 5. Drift Classification Framework

### 5.1 Severity Model

| Level | Response | Escalation | Examples |
|-------|----------|------------|----------|
| LOW | Log, schedule maintenance | None | Stale projection timestamp |
| MEDIUM | Flag, emit event, repair in milestone | Milestone lead | Dependency drift |
| HIGH | Halt segment, investigate, repair before continue | Governance lead | Checkpoint gap, runtime divergence |
| CRITICAL | Immediate freeze, enter RECONCILE | Incident response | Split-brain, lock desync |

### 5.2 Drift Taxonomy (12 Categories)

**Runtime Integrity:**
- `lock_drift` — Lock inconsistency or expiry violation
- `execution_drift` — Active execution references differ across surfaces
- `checkpoint_drift` — Checkpoint corruption, gap, or stale reference
- `projection_drift` — Derived projections stale or corrupted
- `lineage_divergence` — Authority sources disagree
- `orphaned_transition` — Invalid state transition reference
- `runtime_divergence` — Runtime surfaces disagree on milestone/ticket

**Execution Governance:**
- `scope_drift` — Files modified outside ticket scope
- `architecture_drift` — Cross-domain imports or surface violations
- `dependency_drift` — Unauthorized dependency changes
- `state_drift` — Canonical state corruption or structural invalidity
- `authorization_drift` — Permission inconsistencies

### 5.3 Drift Report Format

All drifts emit a standardized report with:
`drift_id`, `incident_id`, `category`, `severity`, `detected_at`, `affected_surfaces`, `description`, `actual_state`, `expected_state`, `root_cause`, `detection_method`, `auto_remediation`, `requires_human_approval`, `repair_plan_reference`, `status`

### 5.4 Canonical Protocol

**Protocol:** `meta/governance/protocols/drift-classification.json`  
**Schema:** `meta/governance/schemas/drift-classification.schema.json`  
**Supersedes:** `drift-recovery.json`

---

## 6. Deterministic Repair Contracts

### 6.1 Repair Contract Structure

Every repair must document:
- `repair_id` (REPAIR-NNN pattern)
- `incident_id` and `drift_reference`
- `authority_source` (determines correct state)
- `pre_condition` and `post_condition`
- `mutation_log` (exact old/new values per file/path)
- `rollback_capability` (boolean)
- `audit_event` (governance journal entry)
- `executed_at` and `executed_by`

### 6.2 Forbidden Operations

| Operation | Severity | Rationale |
|-----------|----------|-----------|
| `silent_overwrite` | CRITICAL | Destroys auditability |
| `ad_hoc_json_patching` | CRITICAL | Non-deterministic, non-replayable |
| `direct_lock_mutation` | CRITICAL | Bypasses guards |
| `untracked_repair_actions` | CRITICAL | Invisible to replay/audit |
| `destructive_restore_without_snapshot` | CRITICAL | Irreversible |
| `checkpoint_mutation_without_audit` | HIGH | Corrupts replay lineage |

### 6.3 Audit Lineage Requirements

1. Pre-state snapshot (hash of affected files)
2. Mutation sequence (structured diff, e.g., RFC 6902 JSON Patch)
3. Post-state snapshot (hash of affected files)
4. Governance event (append-only journal)
5. Integrity assertion (post-condition validation)

### 6.4 Determinism Rules

- Authority-driven: Target state from declared authority only
- Ordered execution: Repairs execute in repair_id sequence
- Idempotent design: Re-execution on repaired state = no-op
- Schema validated: All mutated files validate after repair
- No external dependencies: No network, time-of-day, or randomness dependencies

### 6.5 Canonical Protocol

**Protocol:** `meta/governance/protocols/repair-contract.json`  
**Schema:** `meta/governance/schemas/repair-contract.schema.json`

---

## 7. Integrity Validation Layer

### 7.1 Recovery Exit Criteria (11 Criteria)

All must pass before recovery exits:

1. `single_execution_authority` — At most one active execution with valid lock
2. `monotonic_checkpoint_lineage` — Unbroken monotonic checkpoint chain
3. `projection_freshness` — All projections generated ≥ recovery start
4. `lock_consistency` — Lock state consistent across surfaces
5. `replay_determinism` — Journal replay = checkpoint replay
6. `no_orphaned_transitions` — All transitions reference valid states
7. `invariant_compliance` — All registered invariants pass
8. `schema_conformance` — All governed files validate
9. `audit_trail_completeness` — Every repair has audit event
10. `drift_cleared` — All drifts marked RESOLVED
11. `mode_transition_validity` — Next mode valid per transition matrix

### 7.2 Integrity Suite (7 Phases)

1. **Surface Consistency Check** — Cross-reference all state surfaces
2. **Checkpoint Lineage Validation** — Monotonicity and schema
3. **Authority Reconstruction Replay** — Determinism verification
4. **Invariant Validation** — All invariants against current state
5. **Schema Validation** — All governed files
6. **Projection Consistency** — Freshness and canonical alignment
7. **Audit Trail Validation** — Completeness and append-only

### 7.3 Readiness Gating

| Gate | Blocking | Auto-evaluate |
|------|----------|---------------|
| Integrity gate | Yes | Yes |
| Audit gate | Yes | Yes |
| Thaw authorization gate | Yes | **No** (requires explicit authorization) |
| Mode transition gate | Yes | Yes |

### 7.4 Canonical Protocol

**Protocol:** `meta/governance/protocols/integrity-validation.json`  
**Schema:** `meta/governance/schemas/integrity-validation.schema.json`

---

## 8. Recovery Transition Matrix

### 8.1 Mode Hierarchy

```
NORMAL OPERATIONS
├── GOVERNANCE
├── IMPLEMENTATION
├── REVIEW
├── REFACTOR
├── INCIDENT
└── MIGRATION

RECOVERY OPERATIONS
├── RECONCILE (canonical entrypoint)
├── GOVERNANCE_REPAIR
├── STATE_RECOVERY
└── PROJECTION_REBUILD
```

### 8.2 Critical Transition Rules

- Any NORMAL mode may transition to `RECONCILE` via freeze initiation
- All specialized recovery modes (`GOVERNANCE_REPAIR`, `STATE_RECOVERY`, `PROJECTION_REBUILD`) **must** enter via `RECONCILE`
- Recovery modes may only return to NORMAL modes after: integrity validation passes, audit finalized, thaw authorized
- `RECONCILE` is the **only** recovery mode that can transition directly to NORMAL modes

### 8.3 Forbidden Transitions

- NORMAL → RECOVERY without freeze
- Any mode → GOVERNANCE_REPAIR/STATE_RECOVERY/PROJECTION_REBUILD without RECONCILE
- RECOVERY → NORMAL without integrity validation and thaw authorization

---

## 9. Replay and Reconciliation Contracts

### 9.1 Replay Guarantees

- **Deterministic replay:** Same inputs always produce identical state
- **Monotonic lineage:** Checkpoint timestamps strictly increasing
- **Event order preservation:** Events replay in (timestamp, sequence_number) order
- **Idempotent projection:** Rebuild from same canonical state = identical projections

### 9.2 Reconciliation Contract

When an incident is declared:
1. Freeze initiated and confirmed
2. Authority hierarchy established
3. Drifts classified using taxonomy
4. Repair contracts created for each drift
5. Repairs executed in sequence with full audit lineage
6. Integrity suite executed
7. Exit criteria verified
8. Thaw authorized
9. Mode transition to NORMAL
10. Post-recovery checkpoint emitted

---

## 10. Artifact Inventory

### 10.1 New Protocols (6)

| Protocol | Path | Scope | Canonical |
|----------|------|-------|-----------|
| operational-mode | `meta/governance/protocols/operational-mode.json` | execution | yes |
| execution-freeze | `meta/governance/protocols/execution-freeze.json` | execution | yes |
| authority-reconstruction | `meta/governance/protocols/authority-reconstruction.json` | recovery | yes |
| drift-classification | `meta/governance/protocols/drift-classification.json` | recovery | yes |
| repair-contract | `meta/governance/protocols/repair-contract.json` | recovery | yes |
| integrity-validation | `meta/governance/protocols/integrity-validation.json` | recovery | yes |

### 10.2 New Schemas (5)

| Schema | Path | Governs |
|--------|------|---------|
| operational-mode | `meta/governance/schemas/operational-mode.schema.json` | operational-mode |
| execution-freeze | `meta/governance/schemas/execution-freeze.schema.json` | execution-freeze |
| drift-classification | `meta/governance/schemas/drift-classification.schema.json` | drift-classification |
| repair-contract | `meta/governance/schemas/repair-contract.schema.json` | repair-contract |
| integrity-validation | `meta/governance/schemas/integrity-validation.schema.json` | integrity-validation |

### 10.3 Updated Artifacts

| Artifact | Change |
|----------|--------|
| governance-registry.json | Added 6 protocols, 5 schemas, updated protocol-definition governs list, marked drift-recovery as superseded |
| invariants.json | Added 12 recovery-related invariants (total: 22) |

### 10.4 Superseded Artifacts

| Artifact | Superseded By |
|----------|---------------|
| `meta/governance/protocols/drift-recovery.json` | `drift-classification` |

---

## 11. Verification

### 11.1 Validation Gates

| Gate | Status |
|------|--------|
| All protocols validate against protocol-definition.schema.json | ✅ |
| All schemas are valid JSON Schema draft-07 | ✅ |
| pm:validate | ✅ |
| governance-registry consistency | ✅ |
| invariant registry completeness | ✅ |

### 11.2 Coverage Metrics

| Metric | Before | After |
|--------|--------|-------|
| Protocols | 11 | 17 |
| Schemas | 9 | 14 |
| Invariants | 10 | 22 |
| Recovery modes | 0 | 4 |
| Drift categories | 3 | 12 |

---

## 12. Exit Criteria

This planning phase completes when:

- [x] Recovery modes formally specified (6 protocols)
- [x] Runtime semantics defined (freeze state machine, mode transition matrix)
- [x] Authority model established (6-tier trust hierarchy)
- [x] Integrity contracts documented (11 exit criteria, 7 validation phases)
- [x] Transition rules validated (transition matrix, forbidden transitions)
- [x] Recovery lifecycle complete (freeze → detect → classify → repair → validate → thaw)

**Status: ALL EXIT CRITERIA SATISFIED**

---

## 13. Next Steps

[Decision] Should recovery mode implementation be tracked as:
1. **T27.3** (Invariant Integration & Hardening) — extend existing ticket
2. **New T27.x** under M27 — dedicated recovery mode implementation ticket
3. **M31 subcomponent** — Operational Control Plane integration

[Scope] Implementation scope includes:
- Operational mode validator script
- Execution freeze enforcement in state-mutation.ts
- Drift detection engine integration with audit-runtime.ts
- Repair contract generator
- Integrity validation suite script

[Action] Which implementation path should be taken?

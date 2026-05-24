---
authority:
  level: protocol
  layer: 2
  canonical: true
  supersedes: []
  derives_from:
    - ../CANONICAL_AUTHORITY_HIERARCHY.md
    - ../runtime/runtime-governance-kernel.md
  scope: execution
  status: active
  version: 1.0.0
---

# Work Continuation Protocol

> **Authority:** `CANONICAL_AUTHORITY_HIERARCHY.md` Layer 2 → `runtime-governance-kernel.md`  
> **Purpose:** Deterministic execution scheduling — the system decides what happens next without conversational improvisation.  
> **Principle:** Prefer deterministic continuation over opportunistic task switching.  
> **Version:** 1.0.0  
> **Status:** Active

---

## 1. Core Principle

The system must always prefer **deterministic continuation** over opportunistic task switching.

Improvised next-step selection is a governance failure. Every continuation decision must be:

- **Policy-driven** — derived from explicit priority rules
- **Resumable** — reproducible from canonical state alone
- **Auditable** — emitted as a structured projection
- **Authorized** — proposed, not executed, without operator approval

---

## 2. Continuation Priority Order

Before any new execution, the system resolves the next action through the following priority hierarchy. Evaluation is **short-circuit**: the first matching priority wins.

### Priority 1 — Interrupted Execution Recovery

If `active-execution.json` indicates an interrupted execution:

1. Load the most recent checkpoint for that ticket.
2. Restore exact execution context (milestone, ticket, mutation state).
3. **Prohibit milestone switching.** Resume within the same ticket only.
4. Emit continuation decision with reason `INTERRUPTED_RECOVERY`.

**Gate:** `safe_to_resume === true` AND checkpoint exists AND lock is free.

### Priority 2 — Active Milestone Completion

If the active milestone contains incomplete tickets:

1. Select the next unblocked ticket in dependency order.
2. Preserve milestone continuity.
3. Avoid opening a new milestone.
4. Emit continuation decision with reason `MILESTONE_BACKLOG`.

**Gate:** Milestone status is `in_progress` AND at least one ticket is `planned` or `in_progress` AND all dependencies resolved.

### Priority 3 — Governance Stabilization

Governance/runtime hardening tickets may **temporarily preempt** feature work **only if**:

- Runtime integrity is at risk (confidence < 0.8)
- Resumability systems are incomplete
- Recovery systems are unstable
- Drift risk is `HIGH` or `CRITICAL`

After stabilization, the system **must return** to the previously active milestone.

**Gate:** Runtime confidence < 0.8 OR drift risk ≥ HIGH OR checkpoint system failure.

### Priority 4 — Dependency Unlocking

If the active milestone is blocked by an unresolved dependency:

1. Identify the dependency-unlocking ticket with the lowest blast radius.
2. Prefer tickets that unblock the most downstream work.
3. Emit continuation decision with reason `DEPENDENCY_UNLOCK`.

**Gate:** Active milestone has unresolved dependencies AND a ticket exists that resolves them.

### Priority 5 — Milestone Transition

Only when:

- Current milestone is complete (all tickets `completed` or `cancelled`)
- All validations passed
- Safe exit verified
- Backlog empty
- Next milestone dependencies resolved

May the system transition to the next milestone.

**Gate:** Milestone exit criteria satisfied AND downstream dependencies ready.

---

## 3. Mandatory Continuation Resolution

Before every new execution, the system **must** perform the following resolution sequence:

```
RESOLVE_NEXT_TICKET:
  1. Load active-execution.json
  2. Check for interrupted execution → Priority 1
  3. Load current-milestone.json
  4. Scan milestone tickets for incomplete work → Priority 2
  5. Assess runtime confidence and drift risk → Priority 3
  6. Validate dependency graph for blockers → Priority 4
  7. If all above fail, evaluate milestone transition → Priority 5
  8. If no valid ticket found, emit NO_VALID_TICKET
  9. Generate continuation projection
  10. Await operator authorization
```

**Forbidden:** Skipping resolution, using conversational memory, or defaulting to "what feels next."

---

## 4. Continuation Projection

After resolution, the system **must** emit a structured continuation decision:

```yaml
CONTINUATION_DECISION:
  protocol_version: "1.0.0"
  resolved_at: "2026-05-22T05:20:00Z"
  reason: "MILESTONE_BACKLOG"
  reason_detail: "M3 contains 3 unresolved tickets. No interrupts. No governance risk."
  
  selected_ticket:
    id: "T3.8"
    milestone_id: "M3"
    title: "Frontend Runtime Validation"
    priority: 2
    
  rejected_candidates:
    - id: "T11.4"
      reason: "Governance milestone deferred — runtime stable."
    - id: "M4"
      reason: "Milestone transition blocked — M3 incomplete."
      
  dependency_basis:
    all_dependencies_resolved: true
    blocker_count: 0
    
  governance_basis:
    runtime_confidence: 0.99
    drift_risk: "NONE"
    checkpoint_system: "ACTIVE"
    
  authorization_required: true
  next_action: "Await operator 'proceed' to acquire lock and begin T3.8"
```

**Rule:** No execution begins without this projection being emitted and acknowledged.

---

## 5. Human Authorization Boundary

The orchestration engine may **never** autonomously execute. It operates within a strict propose-stage-execute boundary:

| Phase | System Action | Operator Action |
|-------|--------------|-----------------|
| **Propose** | Emit continuation projection | Reviews |
| **Stage** | Prepare lock, validate ticket, check dependencies | Approves or rejects |
| **Execute** | Acquire lock, mutate state, begin work | Monitors |

**Authorized triggers for execution:** `proceed`, `execute`, `continue`, `resume`, `begin`, `start task`, `run ticket`, `initiate execution`.

**Non-execution triggers (informational only):** `status`, `explain`, `show`, `why`, `thoughts?`, `clarifications`.

---

## 6. Three Engines

This protocol completes the separation of concerns across three distinct engines:

### Runtime Engine
- Execution lifecycle
- Checkpoints and safe exits
- Locks and heartbeats
- State mutations

**Files:** `active-execution.json`, `execution-lock.json`, `CHECKPOINT_PROTOCOL.md`, `SAFE_EXIT_PROTOCOL.md`

### Governance Engine
- Policies and constraints
- Validations and gates
- Drift detection and recovery
- Token efficiency

**Files:** `GOVERNANCE_GATES.md`, `DRIFT_RECOVERY_PROTOCOL.md`, `TOKEN_EFFICIENCY_PROTOCOL.md`

### Orchestration Engine
- Scheduling and continuation
- Dependency routing
- Milestone progression
- Backlog management

**Files:** `WORK_CONTINUATION_PROTOCOL.md`, `current-milestone.json`, `current-ticket.json`

---

## 7. Integration

| Protocol | Integration Point |
|----------|-------------------|
| `EXECUTION_LIFECYCLE_PROTOCOL.md` | Execution begins only after continuation resolution and authorization |
| `CHECKPOINT_PROTOCOL.md` | Interrupted execution is Priority 1 continuation target |
| `SAFE_EXIT_PROTOCOL.md` | Safe exit triggers automatic continuation resolution |
| `GOVERNANCE_GATES.md` | Gate 0 (authorization) enforced after continuation projection |
| `EXECUTION_AUTHORIZATION_PROTOCOL.md` | Authorization boundary prevents autonomous execution |
| `HEARTBEAT_POLICY.md` | Heartbeat includes `next_ticket_proposed` field |

---

## 8. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-22 | Initial protocol. Five-priority continuation hierarchy, mandatory resolution sequence, continuation projection schema, human authorization boundary, three-engine architecture. |

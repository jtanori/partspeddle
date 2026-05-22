# Planning Protocol

> **Authority:** ADR-003  
> **Purpose:** Define the canonical lifecycle for transforming ambiguous human intent into deterministic execution contracts.  
> **Version:** 1.0.0  
> **Status:** Active

---

## Principle

> **No execution may begin without a compiled, approved plan.**

Raw human requests are incomplete by definition. This protocol ensures every request passes through structured stabilization before any runtime mutation occurs.

---

## State Machine

```
INTAKE
    │
    ▼
RESOLVING ──(ambiguity_score > 0)──► clarification loop ──► RESOLVING
    │                                      (operator_override)
    ▼ (ambiguity_score == 0)
STABILIZED
    │
    ▼
COMPILED ──(immutable plan object)──►
    │
    ▼ (human approval)
APPROVED
    │
    ▼ (governance scheduler)
SCHEDULED
    │
    ▼ (execution lock acquired)
ACTIVE
    │
    ▼ (all tickets complete)
COMPLETE
    │
    ▼ (projections archived)
ARCHIVED
```

---

## State Definitions

| State | Meaning | Actor | Exit Condition |
|-------|---------|-------|----------------|
| **INTAKE** | Raw request captured | Human / Operator | Assigned to planning agent |
| **RESOLVING** | Ambiguity analysis active | Planning Agent | `ambiguity_score == 0` OR `operator_override == true` |
| **STABILIZED** | Requirements clarified, ready for compilation | Planning Agent | Agent initiates compilation |
| **COMPILED** | Deterministic plan object exists with ticket bindings | Planning Agent | Human review and approval |
| **APPROVED** | Execution contract ratified | Human / Operator | Governance scheduler queues work |
| **SCHEDULED** | Queued for execution | Governance Runtime | Execution lock available |
| **ACTIVE** | Currently executing | Execution Agent | All tickets complete OR plan cancelled |
| **COMPLETE** | Execution finished | Execution Agent | Projections archived |
| **ARCHIVED** | Immutable historical record | Governance Runtime | None (terminal) |

---

## Layer 1 — Intake

### Trigger

Any request that proposes new work:
- Feature requests
- Bug reports requiring architectural changes
- Refactoring initiatives
- New milestone proposals

### Capture Format

```json
{
  "id": "FEATURE-001",
  "type": "feature-intake",
  "status": "unresolved",
  "title": "Marketplace saved searches",
  "description": "Users should be able to save search queries...",
  "domain": "Marketplace",
  "priority": "high",
  "ambiguity_score": 1.0,
  "questions": [],
  "created_at": "2026-05-22T00:00:00Z"
}
```

### Rules

- Intake MUST NOT contain implementation details
- Intake MUST NOT reference branches, commits, or files
- Intake MUST capture the problem, not the solution
- Intake is append-only — edits create new revisions

---

## Layer 2 — Ambiguity Resolution

### Responsibility

The planning agent analyzes the intake and produces a structured ambiguity report.

### Ambiguity Score

```
ambiguity_score = 1.0 - (resolved_questions / total_questions)
```

Special cases:
- `total_questions == 0` → `ambiguity_score = 1.0` (unknown unknowns)
- `operator_override == true` → `ambiguity_score = 0` (operator accepts risk)

### Clarification Loop

```
1. Agent identifies unknowns, contradictions, missing constraints, cross-domain impact
2. Agent emits structured questions with proposed options
3. Operator responds with selections and rationale
4. Agent updates ambiguity_score
5. If ambiguity_score > 0 and no operator_override, return to step 1
6. If ambiguity_score == 0 or operator_override == true, proceed to STABILIZED
```

### Question Format

```json
{
  "question": "Are searches user-scoped or global?",
  "proposed_options": [
    { "label": "User-scoped only", "value": "user", "description": "..." },
    { "label": "Global with user filters", "value": "global", "description": "..." }
  ],
  "operator_response": {
    "selected_option": "user",
    "rationale": "Privacy requirements mandate user-scoped storage"
  },
  "resolved": true
}
```

---

## Layer 3 — Compilation

### Trigger

`status == STABILIZED` and `ambiguity_score == 0`

### Output

A `compiled-plan` object:

```json
{
  "plan_id": "PLAN-M14-SEARCH",
  "type": "compiled-plan",
  "status": "compiled",
  "milestone": "M14",
  "tickets": ["T14.1", "T14.2", "T14.3"],
  "dependencies": [],
  "execution_order": ["T14.1", "T14.2", "T14.3"],
  "immutable": false,
  "compiled_at": "2026-05-22T12:00:00Z"
}
```

### Rules

- Plan MUST bind to existing milestone and ticket IDs
- Plan MUST specify deterministic execution_order
- Plan MUST declare all dependencies
- Plan MUST NOT reference branches, commits, or files directly
- Compilation is deterministic — same stabilized input always produces same plan

---

## Layer 4 — Approval

### Trigger

Human operator reviews compiled plan and authorizes execution.

### Authorization Format

```
APPROVE PLAN-M14-SEARCH
```

Or per EXECUTION_AUTHORIZATION_PROTOCOL:
```
execute PLAN-M14-SEARCH
```

### Effect

- `status` transitions from `COMPILED` → `APPROVED`
- `immutable` becomes `true`
- Plan becomes append-only
- Governance runtime may schedule execution

---

## Layer 5 — Execution

### Trigger

Governance scheduler assigns execution slot.

### Control

Execution controlled by EXECUTION_AUTHORIZATION_PROTOCOL and runtime state:
- Lock acquisition
- Turn management
- Checkpoint emission
- Safe exit enforcement

### Rules

- Only APPROVED plans may enter ACTIVE state
- Execution MUST follow `execution_order`
- Each ticket completion MUST emit checkpoint
- Plan may be paused but not mutated

---

## Layer 6 — Archival

### Trigger

All tickets in plan reach `completed` or `cancelled`.

### Output

- Plan status → `ARCHIVED`
- Projections generated from plan data
- Plan moved to `planning/archived/`
- Immutable record preserved for audit

---

## Critical Rules

1. **No execution without approval.** A COMPILED plan is NOT executable.
2. **Plans are immutable once approved.** Changes require revision or superseding plan.
3. **Ambiguity must resolve before compilation.** Never compile with ambiguity_score > 0 unless operator_override.
4. **Plans abstract branches.** Branch topology is execution concern, not planning concern.
5. **JSON is authority.** All plan state lives in structured JSON. Markdown is projection only.

---

## Integration with Governance Runtime

```
Human Request → INTAKE → RESOLVING → STABILIZED → COMPILED
                                                        │
                                                        ▼ (approval)
                                              EXECUTION_AUTHORIZATION
                                                        │
                                                        ▼
                                              Governance Runtime
                                                        │
                                                        ▼
                                              ACTIVE → COMPLETE → ARCHIVED
```

---

## Enforcement

- `validate-pm.js` will reject plans without required fields
- `resolve-continuation.ts` will not select tickets from unapproved plans
- Execution locks require approved plan context
- Governance invariants test plan immutability

---
authority:
  level: protocol
  layer: 2
  canonical: true
  supersedes: []
  derives_from:
    - runtime-governance-kernel.md
    - ../adr/003-planning-orchestration.md
  scope: planning
  status: active
  version: 1.0.0
---

# Plan Compilation Protocol

> **Authority:** ADR-003, PLANNING_PROTOCOL.md  
> **Purpose:** Define deterministic compilation from stabilized specifications to executable plans.  
> **Version:** 1.0.0  
> **Status:** Active

---

## Principle

> **Compilation is deterministic: identical stabilized input always produces identical plan output.**

This ensures reproducibility, auditability, and prevents drift between specification and execution.

---

## Prerequisites

Before compilation may begin:

1. Intake status MUST be `STABILIZED`
2. `ambiguity_score` MUST be `0.0` OR `operator_override` MUST be `true`
3. All referenced milestone IDs MUST exist in registry
4. All referenced ticket IDs MUST exist or be creatable
5. Execution agent MUST have read access to all referenced schemas

---

## Compilation Steps

### Step 1 — Validate Stabilized Specification

Verify the intake record:
- Schema validates against `feature-intake.schema.json`
- All questions are resolved
- Operator responses are recorded
- No unresolved contradictions

### Step 2 — Map to Milestone

Determine target milestone:
- If intake references existing milestone → bind to it
- If intake requires new milestone → flag for milestone creation
- Cross-domain intakes → identify primary milestone, flag secondary impacts

### Step 3 — Generate Ticket Sequence

Break stabilized specification into atomic tickets:
- Each ticket MUST have single, verifiable deliverable
- Ticket dependencies MUST form a DAG (no cycles)
- Execution order MUST be topological sort of dependency graph
- Ticket IDs MUST follow pattern `^T[0-9]+(\.[0-9A-Z]+)+$`

### Step 4 — Bind Dependencies

Identify and declare:
- Inter-ticket dependencies within plan
- External dependencies on other milestones
- Blocking conditions (schema changes, infrastructure, approvals)

### Step 5 — Emit Compiled Plan

Produce immutable plan object:

```json
{
  "plan_id": "PLAN-{MILESTONE}-{FEATURE}",
  "type": "compiled-plan",
  "status": "compiled",
  "milestone": "M14",
  "tickets": ["T14.1", "T14.2", "T14.3"],
  "dependencies": ["T13.4"],
  "execution_order": ["T14.1", "T14.2", "T14.3"],
  "immutable": false,
  "compiled_at": "2026-05-22T12:00:00Z",
  "traceability": [
    {
      "source": "FEATURE-001",
      "compilation_step": "ticket-sequence",
      "description": "Derived 3 tickets from stabilized search feature spec"
    }
  ]
}
```

### Step 6 — Register in Planning Registry

Add plan to `project-management/planning/registry.json`:

```json
{
  "version": "1.0.0",
  "intake": ["project-management/planning/intake/FEATURE-001.json"],
  "compiled": ["project-management/planning/compiled/PLAN-M14-SEARCH.json"],
  "archived": [],
  "active_plans": []
}
```

### Step 7 — Generate Projection

Emit human-readable Markdown summary:

```markdown
# Plan: PLAN-M14-SEARCH

## Tickets
- T14.1: Search index schema
- T14.2: Saved search API
- T14.3: Search integration tests

## Dependencies
- T13.4 (Listing API) must complete first

## Execution Order
1. T14.1
2. T14.2
3. T14.3

## Risk: LOW
```

---

## Compilation Rules

1. **Determinism:** Same stabilized input + same schemas = same plan
2. **Atomicity:** Each ticket addresses one concern
3. **Completeness:** Plan covers all requirements from stabilized spec
4. **Feasibility:** All tickets must be implementable within milestone scope
5. **Traceability:** Every plan element links back to intake requirement

---

## Recompilation

If a compiled plan requires changes:

1. **Revision:** Create new plan from same intake (intake → STABILIZED → COMPILED)
2. **Superseding:** Create new plan that references old plan as deprecated
3. **Amendment:** Formal amendment protocol (future governance enhancement)

Old plan status transitions: `COMPILED` → `rejected` (never approved) OR `APPROVED` → `superseded`

---

## Integration with Ticket Creation

Compiled plans may reference tickets that do not yet exist. Ticket creation protocol:

1. Create ticket file in `project-management/data/tickets/`
2. Add ticket to milestone `tickets` array
3. Register in milestone `ticket_paths`
4. Validate with `validate-pm.js`
5. Mark `isValid: true`

Tickets created from plans MUST reference the plan in their metadata:

```json
{
  "metadata": {
    "plan_id": "PLAN-M14-SEARCH",
    "compiled_from": "FEATURE-001"
  }
}
```

---

## Validation Gates

Before compilation is considered complete:

- [ ] Intake schema validates
- [ ] All milestone references resolve
- [ ] All ticket IDs are unique
- [ ] Dependency graph has no cycles
- [ ] Execution order is valid topological sort
- [ ] Plan schema validates
- [ ] Planning registry updated
- [ ] Projection generated

---

## Error Handling

| Condition | Action |
|-----------|--------|
| Missing milestone | Halt compilation, emit MISSING_MILESTONE error |
| Duplicate ticket ID | Halt compilation, emit DUPLICATE_TICKET error |
| Circular dependency | Halt compilation, emit CIRCULAR_DEPENDENCY error |
| Schema validation fail | Halt compilation, emit SCHEMA_VIOLATION error |
| Ambiguity score > 0 | Reject compilation, return to RESOLVING |

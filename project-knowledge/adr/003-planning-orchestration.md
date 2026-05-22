# ADR-003: Planning Orchestration Architecture

> **Status:** Proposed  
> **Date:** 2026-05-22  
> **Author:** VINTRACK Governance Kernel  
> **Supersedes:** Implicit monolithic milestone model, ad hoc governance file growth  
> **Related:** ADR-001 (Repository Structure), ADR-002 (Auth Provider Decoupling)

---

## 1. Context

VINTRACK governance has evolved from a simple ticket-tracking system into a stateful operational layer. The repository now contains:

- Runtime state (`meta/state/canonical-state.json`)
- Execution locks and checkpoints
- Capability registries
- Validation gates
- Recovery playbooks

This evolution exposed a critical architectural gap: **there is no structured layer between human intent and ticket existence.** A request like *"we need marketplace saved searches"* currently enters the system as an immediate execution task, bypassing specification stabilization.

Equally critical: the milestone storage model has bifurcated into:
- `project-management/data/milestones.json` (monolithic, M1–M10)
- `project-management/data/governance-milestones.json` (ad hoc secondary file, M11–M19)

Both patterns are anti-patterns at scale.

---

## 2. Problem Statement

### 2.1 The Monolith Trap

A single `milestones.json` containing all milestones becomes:
- Merge-conflict heavy as parallel workstreams emerge
- Cognitively expensive to review
- Operationally noisy — every milestone change touches the same file
- Hard to diff and delegate

### 2.2 The Decentralization Trap

Allowing arbitrary standalone milestone files (`governance-milestones.json`, etc.) creates:
- Split authority — which file is canonical?
- Discovery ambiguity — how do tools know which files exist?
- Duplicate ID risk
- Inconsistent schema enforcement
- Unclear load order

### 2.3 The Intent Gap

There is no formal layer that:
- Captures raw feature requests
- Resolves ambiguity before execution
- Compiles stabilized specifications into immutable execution contracts
- Separates planning from execution

Without this layer, agents self-authorize work, ambiguity leaks into implementation, and governance collapses under real-world entropy.

---

## 3. Decision

We will adopt a **registry-based modular architecture** for milestone storage, and a **planning state machine** for intent-to-execution orchestration.

### 3.1 Principle: Modular Storage, Centralized Authority

- **Registry** = single authoritative discovery mechanism
- **Domain files** = modular, self-contained milestone documents
- **Aggregation layer** = validates, deduplicates, and presents a unified view

### 3.2 Principle: Planning and Execution Are Separate

- **Planning** produces immutable compiled plans
- **Execution** consumes approved plans through governance protocols
- A plan does not become executable merely because it exists

### 3.3 Principle: JSON Is Authority, Markdown Is Projection

- All canonical state lives in structured JSON
- Human-readable documents are generated projections
- Never the reverse

---

## 4. Architecture

### 4.1 Milestone Storage: Registry + Domain Files

#### Registry (`milestones.registry.json`)

The registry is the **ONLY** authoritative milestone index. It contains:

```json
{
  "version": "1.0.0",
  "schema": "https://vintrack.io/schemas/milestone-registry.schema.json",
  "files": [
    "project-management/milestones/core.json",
    "project-management/milestones/governance.json",
    "project-management/milestones/frontend.json",
    "project-management/milestones/marketplace.json"
  ],
  "active_collections": ["core", "governance"],
  "load_order": "sequential"
}
```

The registry defines:
- File discovery paths
- Load order
- Schema versioning
- Active collections (which domains are in-scope)

It does NOT contain milestone definitions.

#### Domain Milestone Files (`project-management/milestones/*.json`)

Each file is self-contained, domain-scoped, and schema-valid:

```text
project-management/milestones/
├── core.json        (M1–M10)
├── governance.json  (M11–M19)
├── frontend.json    (M20+ when created)
├── marketplace.json (M20+ when created)
└── runtime.json     (M20+ when created)
```

Benefits:
- Smaller diffs
- Easier reviews
- Easier delegation
- Lower merge conflict rates
- Clear domain ownership

#### Aggregation Layer

All tools load milestones through the registry:

```
loadMilestones()
  ├── read registry
  ├── resolve each file path
  ├── validate against milestone.schema.json
  ├── check for duplicate IDs across files
  ├── check for invalid dependencies
  └── return aggregated array
```

Critical enforcement:
- Duplicate milestone IDs → **fatal error**
- Duplicate ticket IDs across files → **fatal error**
- Invalid dependency references → **fatal error**
- Schema violations → **fatal error**

### 4.2 Ticket Storage: Directory Scan (Implicit Registry)

Tickets already use the correct model:

```text
project-management/data/tickets/
├── T1.1.json
├── T1.2.json
├── ...
├── T19.5.json
```

The filesystem IS the registry. Tools scan the directory. No explicit index needed because:
- Tickets are numerous (100+)
- They are uniform in structure
- Filename collision is sufficient uniqueness enforcement

### 4.3 Planning State Machine

A new top-level layer sits between human intent and ticket execution:

```text
project-management/planning/
├── registry.json
├── schemas/
│   ├── feature-intake.schema.json
│   ├── compiled-plan.schema.json
│   └── planning-registry.schema.json
├── intake/
│   ├── FEATURE-001.json
│   └── FEATURE-002.json
├── compiled/
│   ├── PLAN-M14-search.json
│   └── PLAN-M15-auth.json
└── projections/
    ├── PLAN-M14-search.md
    └── PLAN-M15-auth.md
```

#### State Machine

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
COMPILED ──(immutable plan object created)──►
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

#### State Definitions

| State | Meaning | Exit Conditions |
|-------|---------|-----------------|
| **INTAKE** | Raw human request captured | Assigned to planner |
| **RESOLVING** | Ambiguity analysis in progress | `ambiguity_score == 0` or `operator_override == true` |
| **STABILIZED** | Requirements clarified, ready for compilation | Planner initiates compilation |
| **COMPILED** | Deterministic plan object exists with ticket bindings | Human review and approval |
| **APPROVED** | Execution contract ratified | Governance scheduler queues work |
| **SCHEDULED** | Queued for execution | Execution lock available |
| **ACTIVE** | Currently executing | All tickets complete or plan cancelled |
| **COMPLETE** | Execution finished | Projections archived |
| **ARCHIVED** | Immutable historical record | None (terminal) |

#### Critical Rule: Compiled Plans Are Immutable

Once `status == APPROVED`, the compiled plan becomes append-only. Changes require:
- A revision (new compiled plan)
- A superseding plan
- A formal amendment protocol
- Recompilation from STABILIZED

This ensures execution determinism.

#### Abstraction Rule: Plans Do Not Reference Branches

```text
Plan → Milestone → Ticket → Branch
```

Plans bind to milestones and tickets. Branch topology is an execution concern, not a planning concern. This keeps plans stable while branches evolve.

### 4.4 Execution Turn Model

Each active plan receives execution metadata:

```json
{
  "execution": {
    "lock": false,
    "active_ticket": null,
    "current_turn": 0,
    "max_parallelism": 1,
    "turn_history": []
  }
}
```

Governance runtime controls:
- Which agent may execute
- Which ticket within the plan
- Execution order
- Pre-conditions (clean worktree, valid branch, etc.)

This integrates with:
- Runtime locks
- Safe exit protocols
- Drift detection
- Confidence scoring

---

## 5. File Structure (Target)

```text
project-management/
├── data/
│   ├── milestones.registry.json      ← authoritative discovery
│   └── tickets/                      ← one file per ticket
│       ├── T1.1.json
│       └── ...
│
├── milestones/                       ← modular domain files
│   ├── core.json
│   ├── governance.json
│   ├── frontend.json
│   ├── marketplace.json
│   └── runtime.json
│
├── planning/                         ← intent-to-execution layer
│   ├── registry.json
│   ├── schemas/
│   │   ├── feature-intake.schema.json
│   │   ├── compiled-plan.schema.json
│   │   └── planning-registry.schema.json
│   ├── intake/
│   ├── compiled/
│   └── projections/
│
├── protocols/
├── recovery/
└── schemas/
```

---

## 6. Migration Strategy

### Phase 1: Registry Infrastructure (T11.5)

1. Design `milestones.registry.json` schema
2. Create `project-management/milestones/` directory
3. Decompose `milestones.json` → `milestones/core.json`
4. Decompose `governance-milestones.json` → `milestones/governance.json`
5. Write aggregation layer (`scripts/lib/milestone-loader.ts`)
6. Update all tools to resolve through registry
7. Mark old monolithic files as deprecated
8. Validate: all 19 milestones load, no duplicates, all dependencies valid

### Phase 2: Planning State Machine Specification (T11.6)

1. Draft ADR-003 (this document) — **current step**
2. Design planning schemas (intake, compiled-plan, registry)
3. Define state machine transitions and entry/exit conditions
4. Write protocols: PLANNING, PLAN_COMPILATION, AMBIGUITY_RESOLUTION
5. Review and approve before implementation

### Phase 3: Planning Implementation (Future Ticket)

1. Implement planning registry and state machine
2. Integrate with execution authorization protocol
3. Add plan-level projections
4. Add execution turn model
5. Test with simulated feature intake → execution flow

### Phase 4: Governance Enforcement

1. Validators reject orphan milestone files
2. Validators reject unregistered milestone files
3. Validators enforce global ID uniqueness
4. Validators check for circular dependencies

---

## 7. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Registry becomes single point of failure | Medium | High | Registry is small, simple JSON; easy to validate and recover |
| Domain files proliferate uncontrollably | Medium | Medium | Registry enforces explicit listing; validators reject orphans |
| Planning state machine adds too much ceremony | High | High | Keep states minimal; allow `operator_override` for known paths; measure cycle time |
| Agents bypass planning layer | High | High | Execution authorization protocol gates on plan approval; bypass is a governance breach |
| Existing branches break after registry migration | Medium | High | Test each branch rebasing onto governance main before promotion |
| Over-governance kills productivity | Medium | High | Regular review of planning latency; simplify if cycle time > threshold |

---

## 8. Acceptance Criteria

- [ ] `milestones.registry.json` validates against its schema
- [ ] All tools resolve milestones through registry (no hardcoded paths)
- [ ] Domain milestone files pass schema validation independently
- [ ] Aggregation layer detects duplicate milestone IDs
- [ ] Aggregation layer detects duplicate ticket IDs across files
- [ ] Aggregation layer detects invalid dependencies
- [ ] Old `milestones.json` and `governance-milestones.json` are deprecated
- [ ] Planning state machine schema defines all 8 states
- [ ] Planning protocols define entry/exit conditions for each transition
- [ ] Compiled plans are immutable once approved
- [ ] Plans abstract branches (Plan → Milestone → Ticket → Branch)
- [ ] Execution turn model controls concurrency and authorization
- [ ] All changes pass governance invariant tests
- [ ] All changes pass `validate-pm.js`

---

## 9. Consequences

### Positive

- Scalable milestone storage as project grows
- Single authoritative discovery mechanism
- Structured intent-to-execution pipeline
- Immutable execution contracts prevent drift
- Planning and execution separation enables safer delegation

### Negative

- Additional complexity in governance layer
- More schemas and protocols to maintain
- Planning state machine adds initial latency to feature work
- All tools must be updated to use registry
- Existing branches may need rebasing

### Neutral

- Tickets continue using directory-scan model (no change)
- Runtime state (`canonical-state.json`) remains separate concern
- Recovery playbooks may need updating for new file paths

---

## 10. Related Decisions

| ADR | Relationship |
|-----|-------------|
| ADR-001 (Repository Structure) | Foundation; this ADR extends it with planning layer |
| ADR-002 (Auth Decoupling) | Independent; no direct relationship |

---

## 11. Notes

This ADR was produced through structured ambiguity resolution. Key clarifications that stabilized the specification:

1. **Scope:** Planning orchestration folded into M11 (not M12 or M20+)
2. **Priority:** Registry migration (A) sequential before planning state machine (B)
3. **Boundary:** Existing T12.1–T19.5 remain as-is until A and B complete
4. **Process:** ADR written and reviewed before implementation begins

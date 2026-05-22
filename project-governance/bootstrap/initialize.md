# VINTRACK Bootstrap Initialization Protocol

> **The ONLY startup command.**  
> Location: `project-governance/bootstrap/initialize.md`  
> Purpose: mandatory governance loading before ANY task execution.

---

## INSTRUCTION

Before executing ANY task, run this protocol in order.

Do not skip steps.  
Do not start implementation directly.  
Governance first. Execution second.

---

## STEP 1 — Load Governance Kernel

**Load:** `project-governance/runtime/runtime-governance-kernel.md`

**Establish:**
- Constitutional constraints
- Core invariants (non-negotiable)
- Mandatory startup procedure
- Architectural constraints
- Surface governance rules
- Contract ownership doctrine
- Traceability rules
- CI governance
- Forbidden behaviors
- Execution expectations
- Escalation rules

**If this file is missing: STOP. Cannot proceed without the Constitution.**

---

## STEP 2 — Load Continuation Policy

**Load:** `project-governance/runtime/continuation-policy.md`

**Establish:**
- Converts the session into a resumable governed runtim
- Forbidden behaviors
- Enforces graph-driven continuation instead of heuristic continuation
- Freezes scope boundaries
- Prevents “helpful AI expansion syndrome.”

**If this file is missing: STOP. Cannot proceed without the Constitution.**

---

## STEP 3 — Load Runtime State

**Load:** `project-governance/runtime/runtime-state.json`

**Identify:**
- `active_milestone.id` — current milestone
- `active_milestone.status` — must be `in_progress` or `planned`
- `active_ticket.id` — current ticket
- `active_ticket.status` — must be `in_progress` or `planned`
- `execution_surface` — backend, frontend-rsc, frontend-client, shared, infrastructure, fullstack, ci-cd
- `blocked_tickets` — tickets that cannot proceed
- `active_constraints` — runtime constraints in effect
- `ci_requirements` — validation gates

**If no active ticket: STOP. Request ticket assignment before proceeding.**

---

## STEP 4 — Load Dependency Graph

**Load:** `project-governance/runtime/dependency-graph.json`

**Resolve:**
- Ticket dependencies satisfied?
- Milestone sequencing respected?
- No cycles in dependency graph?
- Surface constraints match execution context?

**If dependencies are unresolved: STOP. Complete blocking work first.**

---

## STEP 5 — Load Surface Map

**Load:** `project-governance/runtime/surface-map.json`

**Validate:**
- Current execution surface is authorized
- Cross-surface imports are legal
- Runtime boundaries are respected
- Forbidden import paths are not violated

**If surface constraints are violated: STOP. Re-architect or request governance exception.**

---

## STEP 6 — Load Contract Registry

**Load:** `project-governance/runtime/contract-registry.json`

**Validate:**
- Contracts needed for current ticket exist
- Ownership is respected (backend owns, frontend consumes)
- No duplicate or shadow contracts
- Contract locations exist in repository

---

## STEP 7 — Determine Execution Mode

**Load:** `project-governance/runtime/execution-modes.md`

**Determine mode from user intent:**

| Intent | Mode |
|--------|------|
| Planning, governance review, architecture discussion | GOVERNANCE |
| Ticket implementation, feature development | IMPLEMENTATION |
| Code review, quality assurance | REVIEW |
| Bug fix, failure recovery | INCIDENT |
| Internal refactor within existing interfaces | REFACTOR |
| Structural change, reorganization | MIGRATION |

**Apply behavioral constraints from the determined mode.**

---

## STEP 8 — Governance Validation

Before proceeding, confirm ALL of the following:

- [ ] Active milestone identified and valid
- [ ] Active ticket identified and valid
- [ ] Ticket dependencies resolved
- [ ] Runtime surface validated
- [ ] Execution mode determined
- [ ] Acceptance criteria identified (from ticket file)
- [ ] Governance conflicts absent

**If ANY check fails: STOP and request missing governance artifacts.**

Do not proceed with incomplete governance context.

---

## STEP 9 — Load Execution Capsule (Optional but Recommended)

**If exists:** `project-governance/execution-capsules/{ticket_id}.context.md`

**Load:**
- Ticket-specific context
- File inventory
- Known risks
- Acceptance criteria breakdown
- Related contracts

This eliminates context drift and reduces reload overhead.

---

## STEP 10 — Execute Task

**Only after successful governance validation may implementation begin.**

Execution rules:
- Stay within ticket scope
- Respect surface boundaries
- Preserve contracts
- Update traceability
- Run ticket-relevant tests only
- Do not run full test suites (CI/CD realm only)

### AUTOMATIC EXECUTION TRANSITION

**After successful governance validation in Step 7:**

The runtime MUST transition immediately into EXECUTION phase.

**DO NOT:**
- Wait for conversational confirmation
- Generate additional analysis
- Re-plan the ticket
- Request permission to proceed
- Enter an idle state

**DO:**
- Load the active ticket from `project-management/data/tickets/{ticket_id}.json`
- Load the execution capsule if it exists
- Execute the first remaining step from `checkpoints/latest-checkpoint.json`
- Begin deterministic implementation immediately

Bootstrap completion is NOT a terminal state. It is the transition into execution.

---

## EMERGENCY OVERRIDE

If a critical production incident requires immediate action:

1. Log the override in `runtime-state.json` emergency_notes
2. Execute in INCIDENT mode
3. Reconcile governance artifacts after resolution

**Overrides are logged and reviewed. They are not a bypass mechanism.**

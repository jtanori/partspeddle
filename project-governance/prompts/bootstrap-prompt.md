# Bootstrap Prompt

> **Mandatory startup sequence for every VINTRACK session.**

---

## Step 1: Load Governance Kernel

Read `project-governance/runtime/runtime-governance-kernel.md`.

This is the constitution. All behavior derives from it.

## Step 2: Load Runtime State

Read `project-governance/runtime/runtime-state.json`.

Identify:
- Active milestone
- Active ticket
- Execution surface
- Blocked tickets
- Active constraints

## Step 3: Load Dependency Graph

Read `project-governance/runtime/dependency-graph.json`.

Validate:
- Ticket dependencies are satisfied
- Milestone sequencing is respected
- Surface constraints match execution context

## Step 4: Load Surface Map

Read `project-governance/runtime/surface-map.json`.

Validate:
- Current execution surface is authorized
- Cross-surface imports are legal
- Runtime boundaries are respected

## Step 5: Load Contract Registry

Read `project-governance/runtime/contract-registry.json`.

Validate:
- Contracts needed for current ticket exist
- Ownership is respected
- No duplicate or shadow contracts

## Step 6: Establish Execution Mode

Read `project-governance/runtime/execution-modes.md`.

Determine mode from user intent:
- Planning / governance review → GOVERNANCE
- Ticket implementation → IMPLEMENTATION
- Code review → REVIEW
- Bug fix → INCIDENT
- Refactor → REFACTOR
- Restructure → MIGRATION

## Step 7: Validate Acceptance Criteria

Load the active ticket from `project-management/data/tickets/{ticket_id}.json`.

Extract acceptance criteria.

**Do NOT begin work until acceptance criteria are clear.**

## Step 8: Execute

Begin deterministic execution within ticket scope.

---

## If Any Step Fails

STOP. Report missing artifacts. Do not proceed with incomplete governance context.

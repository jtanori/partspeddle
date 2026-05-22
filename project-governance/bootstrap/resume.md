# Resume Execution

> **Authority:** meta/state/canonical-state.json  
> **Protocol:** WORK_CONTINUATION_PROTOCOL  
> **Version:** 2.0.0 (ADR-003 compliant)

---

## 1. Load Canonical State

```bash
meta/state/canonical-state.json
```

Key fields:
- `milestone.id` — active/completed milestone
- `ticket.id` — active ticket (or null)
- `execution.status` — EXECUTING / COMPLETE / null
- `repository.branch` — current execution branch
- `repository.worktree_clean` — must be true

## 2. Resolve Continuation

```bash
./node_modules/.bin/tsx scripts/resolve-continuation.ts
```

Reads:
- `project-governance/runtime/state/current-milestone.json`
- `project-management/data/milestones.registry.json`
- `project-management/data/tickets/`

Emits:
- Selected ticket (or null)
- Reason code
- Next action

## 3. Validate Before Execution

```bash
node scripts/validate-pm.js
```

Must pass with 0 errors.

## 4. Check for Clarifications

```bash
ls project-governance/runtime/clarifications/*.json
```

Unresolved clarifications block execution.

## 5. Resume Deterministically

Execute selected ticket per:
- EXECUTION_AUTHORIZATION_PROTOCOL.md
- TICKET_CREATION_PROTOCOL.md (if creating new tickets)
- PLANNING_PROTOCOL.md (if planning new work)

---

## Legacy Files (Superseded)

| Old Path | New Authority |
|----------|--------------|
| `runtime-state.json` | `meta/state/canonical-state.json` |
| `latest-checkpoint.json` | Per-ticket in `project-governance/runtime/checkpoints/` |
| `surface-map.json` | Derived from `project-management/data/milestones.registry.json` + `tickets/` |
| `dependency-graph.json` | Still valid — loaded by `validate-pm.js` |

---
authority:
  level: kernel
  layer: 1
  canonical: false
  supersedes: []
  derives_from: []
  scope: execution
  status: deprecated
  version: 1.0.0
  superseded_by:
    - ../protocols/EXECUTION_AUTHORIZATION_PROTOCOL.md
    - ../protocols/EXECUTION_LIFECYCLE_PROTOCOL.md
---

# continuation-policy.md

> **DEPRECATED** — This document is superseded by `EXECUTION_AUTHORIZATION_PROTOCOL.md` and `EXECUTION_LIFECYCLE_PROTOCOL.md` as of 2026-05-22.
>
> **Reason:** The auto-continuation semantics in this document contradicted `EXECUTION_AUTHORIZATION_PROTOCOL.md`, which requires explicit execution authorization. The canonical authority hierarchy (see `CANONICAL_AUTHORITY_HIERARCHY.md`) resolves this conflict in favor of explicit authorization.
>
> **Migration:**
> - For authorization gates → `EXECUTION_AUTHORIZATION_PROTOCOL.md`
> - For phase transitions and completion rules → `EXECUTION_LIFECYCLE_PROTOCOL.md`
> - For checkpoint/resume → `CHECKPOINT_PROTOCOL.md` + `SAFE_EXIT_PROTOCOL.md`

---

## Autonomous Continuation Rules (DEPRECATED — DO NOT USE)

When a ticket reaches acceptance criteria completion:

* Automatically mark ticket COMPLETE if:

  * required builds pass
  * required typechecks pass
  * required architectural validations pass
  * no severity-1 blockers exist

* DO NOT pause for human approval unless:

  * dependency graph ambiguity exists
  * architectural conflicts emerge
  * governance violations occur
  * destructive migrations are required
  * acceptance criteria cannot be validated
  * runtime surface ownership becomes unclear

---

## Incidental Failure Policy (DEPRECATED — DO NOT USE)

The following are NON-BLOCKING unless explicitly declared blocking in dependency-graph.json:

* pre-existing lint failures
* pre-existing flaky tests
* environmental instability
* unrelated type regressions
* legacy infra debt

Instead:

* generate deferred remediation tickets
* classify severity
* continue execution

---

## Autonomous Ticket Routing (DEPRECATED — DO NOT USE)

After ticket completion:

1. load dependency-graph.json
2. resolve next executable ticket
3. validate dependencies
4. validate runtime surface ownership
5. begin execution automatically

No human intervention required unless governance escalation triggers.

---

## Scope Expansion Policy (DEPRECATED — DO NOT USE)

Agents are prohibited from:

* opportunistic refactors
* unrelated cleanup
* architecture rewrites
* style normalization outside active scope

Unless:

* required for acceptance criteria
* required for compilation integrity
* required for dependency compatibility

---

## Governance Escalation Triggers (DEPRECATED — DO NOT USE)

Pause execution ONLY if:

* milestone conflicts exist
* dependency cycles detected
* runtime invariants fail
* data-loss risk exists
* security model changes
* architectural layer violations occur
* execution confidence drops below acceptable threshold

Otherwise continue autonomously.

---

## Completion Output Requirements (DEPRECATED — DO NOT USE)

After every ticket:

Required outputs:

* checkpoint summary
* acceptance matrix
* modified file manifest
* architectural impact summary
* deferred remediation manifest (if applicable)

Then continue automatically.

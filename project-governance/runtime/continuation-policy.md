# continuation-policy.md

## Autonomous Continuation Rules

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

## Incidental Failure Policy

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

## Autonomous Ticket Routing

After ticket completion:

1. load dependency-graph.json
2. resolve next executable ticket
3. validate dependencies
4. validate runtime surface ownership
5. begin execution automatically

No human intervention required unless governance escalation triggers.

---

## Scope Expansion Policy

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

## Governance Escalation Triggers

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

## Completion Output Requirements

After every ticket:

Required outputs:

* checkpoint summary
* acceptance matrix
* modified file manifest
* architectural impact summary
* deferred remediation manifest (if applicable)

Then continue automatically.


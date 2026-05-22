# Execution Authorization Protocol

> **Authority:** `runtime-governance-kernel.md`  
> **Purpose:** Prevent unauthorized execution. Distinguish informational interaction from execution authorization.  
> **Version:** 1.0.0  
> **Status:** Active

---

## 1. Principle

> **No runtime mutation or execution transition may occur without explicit execution authorization.**

This is a hard governance law. Violation is a critical protocol breach.

---

## 2. Intent Classification

Every user input is classified into exactly one of two categories:

### 2.1 Informational (NON_EXECUTIONAL)

**Definition:** Queries, clarifications, reactions, or continuations that do not request state mutation.

**Examples (never trigger execution):**

```
status
explain
why
show
what happened
are we ready?
thoughts?
questions
clarifications
well?
okay
nice
cool
got it
thanks
```

**System behavior for informational inputs:**
- Read canonical state
- Generate projections
- Answer questions
- **Never** acquire locks, transition tickets, or mutate runtime state

### 2.2 Authorization (EXECUTIONAL)

**Definition:** Explicit directives to begin, continue, or resume execution of a specific task.

**Authorized triggers:**

```
proceed
execute
continue
resume
begin
start task {task_id}
run ticket {task_id}
initiate execution
begin {milestone} {ticket}
```

**Requirements for valid authorization:**
1. Must explicitly reference a task, ticket, or milestone, OR
2. Must use an authorized trigger word in response to a staged execution plan
3. Must occur AFTER runtime validation is presented

---

## 3. Pre-Execution Staging

Before any execution begins, the system enters **pre-execution staging**. This is observational, not mutational.

### 3.1 Staging Actions (Permitted Without Authorization)

| Action | Description |
|--------|-------------|
| Read runtime state | Load `active-execution.json`, `current-ticket.json` |
| Read ticket schema | Load ticket definition from `project-management/data/tickets/{ticket_id}.json` |
| Validate dependencies | Check if dependencies are resolved |
| Assess risk | Determine `estimated_risk` |
| Identify rollback point | Determine `rollback_point` |
| Present execution plan | Show the user what will happen |

### 3.2 Staging Presentation Format

```
EXECUTION PLAN (STAGING — NOT ACTIVE)
Task:     T11.3 — Create base JSON schemas
Milestone: M11
Surfaces: shared
Risk:     LOW
Rollback: git HEAD
Plan:
  1. Acquire execution lock
  2. Initialize active-execution.json
  3. Create checkpoint
  4. Write meta/schemas/*.json
  5. Validate schemas
  6. Emit checkpoint
  7. Complete execution

Type 'proceed' to authorize execution.
Type 'cancel' to abort.
```

**Rule:** The system MUST NOT proceed past staging without explicit authorization.

---

## 4. Runtime Mutation Guard

The following actions **REQUIRE** execution authorization. Without it, they are forbidden.

| Action | Classification |
|--------|----------------|
| Acquire execution lock | **MUTATION** — modifies `execution-lock.json` |
| Release execution lock | **MUTATION** — modifies `execution-lock.json` |
| Transition ticket status | **MUTATION** — modifies ticket state |
| Mutate `active-execution.json` | **MUTATION** — canonical runtime state |
| Generate checkpoint | **MUTATION** — writes to `checkpoints/` |
| Emit heartbeat | **MUTATION** — writes to `heartbeats/` |
| Transition runtime state | **MUTATION** — changes lifecycle state |
| Update drift state | **MUTATION** — modifies drift records |

**Observation-only actions** (do NOT require authorization):

| Action | Classification |
|--------|----------------|
| Read `active-execution.json` | **OBSERVATION** |
| Read `runtime-state.json` | **OBSERVATION** |
| Generate projections | **OBSERVATION** (read-only rendering) |
| Run integrity audit | **OBSERVATION** (read-only validation) |
| Answer questions about state | **OBSERVATION** |

---

## 5. Authorization Sequence

### Correct Sequence

```
1. User sends status query        → System reads state (observation)
2. User sends execution request   → System enters staging (observation)
3. System presents execution plan → User reviews (observation)
4. User sends explicit authorize  → System acquires lock (mutation)
5. System initializes runtime     → (mutation)
6. System generates checkpoint    → (mutation)
7. System validates integrity     → (observation + mutation for audit log)
8. System emits EXECUTION_START   → (mutation)
9. System executes work           → (mutation)
10. System completes and exits    → (mutation)
```

### Incorrect Sequence (PROHIBITED)

```
1. User sends status query        → System reads state
2. User sends ambiguous prompt    → System ACQUIRES LOCK (FORBIDDEN)
3. System initializes runtime     → (FORBIDDEN — no authorization)
4. System mutates state           → (FORBIDDEN — no authorization)
```

---

## 6. Invalid Authorization Recovery

If the system incorrectly interprets an ambiguous input as authorization:

1. **ABORT** execution initialization immediately
2. **RELEASE** any acquired execution lock
3. **REVERT** any runtime state mutations
4. **EMIT** ambiguity warning to user
5. **REQUIRE** explicit authorization before retry

**Recovery template:**

```
⚠️ AMBIGUITY DETECTED

Your input "{input}" was ambiguous.
No execution was started. No state was mutated.

To begin execution, use one of:
  proceed
  execute {task_id}
  begin {milestone} {ticket}

To check status, use: status
```

---

## 7. Integration with Other Protocols

| Protocol | Integration Point |
|----------|-------------------|
| `EXECUTION_LIFECYCLE_PROTOCOL.md` | Authorization is the gateway to `READY` → `EXECUTING` transition |
| `STATE_MUTATION_RULES.md` | Lock acquisition (Event 0) now requires authorization pre-check |
| `SAFE_EXIT_PROTOCOL.md` | Exit does not require authorization; it is automatic on completion |
| `GOVERNANCE_GATES.md` | Gate 0: Authorization Verified (precedes all other gates) |

---

## 8. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-22 | Initial protocol. Intent classification, mutation guard, staging format, recovery procedure. |

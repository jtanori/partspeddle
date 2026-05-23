---
authority:
  level: kernel
  layer: 1
  canonical: true
  supersedes:
    -
  derives_from:
    - runtime-governance-kernel.md
  scope: execution
  status: active
  version: "1.0.0"
---

# Execution Modes

> **Behavioral Constraints**  
> Location: `project-governance/runtime/execution-modes.md`  
> Purpose: constrain model behavior, prevent uncontrolled reasoning, normalize execution patterns.

---

## GOVERNANCE Mode

**Purpose:** Planning, governance, architecture review  
**Allowed:**
- Review and update governance artifacts
- Plan milestone and ticket sequences
- Validate architectural constraints
- Update runtime state and dependency graphs

**Forbidden:**
- Implementation of production code
- Test writing
- Direct file modification outside governance artifacts
- Code without planning

**Behavior:** analytical, deliberate, risk-aware

---

## IMPLEMENTATION Mode

**Purpose:** Deterministic execution of ticket work  
**Allowed:**
- Implement scoped ticket work
- Satisfy acceptance criteria
- Update traceability
- Write tests for the ticket scope
- Update ticket's test plan
- Run ticket-relevant tests only (test plan)

**Forbidden:**
- Architecture redesign
- Dependency expansion
- Methodology changes
- Ticket scope expansion
- Full test suite execution (CI/CD realm only)

**Behavior:** deterministic, concise, execution-oriented

---

## REVIEW Mode

**Purpose:** Validation and quality assurance  
**Allowed:**
- Review code against acceptance criteria
- Verify test coverage and test plan
- Check surface boundary compliance
- Validate contract usage
- Flag governance violations

**Forbidden:**
- Rewriting implementation
- Adding features
- Changing architecture

**Behavior:** critical, precise, criterion-based

---

## REFACTOR Mode

**Purpose:** Constrained refactor within existing contracts  
**Allowed:**
- Rename internal symbols
- Extract functions
- Improve performance within existing interfaces
- Update tests to match refactored code

**Forbidden:**
- Change public APIs
- Add or remove contracts
- Cross-domain moves

**Behavior:** conservative, interface-preserving

---

## INCIDENT Mode

**Purpose:** Debugging and failure recovery  
**Allowed:**
- Investigate logs and errors
- Reproduce failures
- Apply minimal fixes
- Add regression tests
- Save test failures to the ticket's observability

**Forbidden:**
- Scope expansion
- Architecture changes
- Skip test coverage
- Skip test plan

**Behavior:** focused, root-cause-oriented

---

## MIGRATION Mode

**Purpose:** Structural change with governance oversight  
**Allowed:**
- File and directory restructures
- Dependency upgrades
- Configuration migrations
- Cross-cutting refactors
- Checkpoint emission after each atomic segment

**Forbidden:**
- Unplanned structural changes
- Changes without dependency graph updates
- Execution without checkpoint persistence

**Behavior:** systematic, documented, reversible, checkpointed

---

## Checkpoint Emission Rules

All execution modes MUST emit a checkpoint update at:

1. **Segment boundaries** — after completing an atomic execution segment
2. **Before long-running operations** — builds, test suites, migrations > 2 min
3. **After file modifications** — whenever deliverables change
4. **On interruption risk** — before operations likely to trigger timeouts

### Emission Format

```
CHECKPOINT UPDATE:
- completed: [exact step names]
- remaining: [exact step names]
- blockers: [list or "none"]
- next step: [single precise action]
- modified_files: [paths]
```

### Persistence Rule
After emitting a checkpoint, the agent MUST write `checkpoints/latest-checkpoint.json` before proceeding to the next action.

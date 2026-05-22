# IMPLEMENTATION Mode Prompt

> **Deterministic execution of scoped ticket work.**

---

## Context

You are in IMPLEMENTATION mode. Your job is to execute the active ticket's acceptance criteria with minimal, deterministic changes.

## Rules

1. **Scope Bound**
   - Implement only what the ticket requires
   - Do not expand scope
   - Do not add unplanned features

2. **Surface Discipline**
   - Respect `surface-map.json`
   - Only import from `allowed_imports`
   - Never import from `forbidden_imports`

3. **Contract Preservation**
   - Consume contracts from `contract-registry.json`
   - Do not redefine or shadow contracts
   - Backend owns contracts; frontend consumes them

4. **Test Discipline**
   - Write tests for the ticket scope
   - Run only ticket-relevant tests
   - Do NOT run full test suites (CI/CD realm only)
   - All new code must have accompanying tests

5. **Traceability**
   - Update ticket traceability with files changed
   - Use atomic commit format: `type(domain): description (T{milestone}.{sequence})`

6. **Determinism**
   - No exploratory changes
   - No speculative abstractions
   - Prefer clarity over cleverness

## Allowed Actions

- Implement scoped ticket work
- Satisfy acceptance criteria
- Update traceability
- Write ticket-relevant tests
- Update runtime state when ticket completes

## Forbidden Actions

- Architecture redesign
- Dependency expansion
- Methodology changes
- Ticket scope expansion
- Full test suite execution
- Cross-domain imports via direct reference (use events)

## Exit Criteria

Implementation mode exits when:
- All acceptance criteria are satisfied
- Ticket-relevant tests pass
- Runtime state is updated
- Governance artifacts are synchronized

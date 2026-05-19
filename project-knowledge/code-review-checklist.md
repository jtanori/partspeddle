# VINTRACK — Code Review Checklist

## Purpose

Minimal, enforceable checklist for every code change. Used by human reviewers and AI self-review before marking work complete.

---

## Mandatory Checks

### Architecture

- [ ] Code stays within its bounded context
- [ ] No cross-domain imports (enforced by ESLint)
- [ ] Domain entities have no infrastructure dependencies
- [ ] Application services own transactional boundaries
- [ ] Events emitted on state changes (not on reads)

### Correctness

- [ ] TypeScript compiles with `strict: true`
- [ ] No `any` types without `@ts-expect-error` + justification
- [ ] All errors wrapped in domain errors before crossing boundaries
- [ ] Async operations use `await` (no floating promises)
- [ ] State machine transitions validated before execution

### Testing

- [ ] Unit tests for new domain logic
- [ ] Integration tests for DB schema changes
- [ ] Event contract tests for new/changed events
- [ ] Failure-path tests for error conditions
- [ ] Tests are deterministic (no `Date.now()`, no randomness)

### Security

- [ ] No secrets in code
- [ ] No raw card data or JWTs logged
- [ ] RLS policies cover new tables
- [ ] Input validated at API boundary (zod schemas)
- [ ] Idempotency keys used for financial operations

### Observability

- [ ] Structured logging with correlation IDs
- [ ] New events conform to canonical envelope
- [ ] Errors include `code`, `correlationId`, `isRetryable`

---

## Reviewer Authority

| Severity | Action |
|----------|--------|
| **Block** | Cross-domain coupling, missing RLS, secrets in code, no tests for state machine |
| **Request Change** | Type errors, missing error handling, incorrect event envelope |
| **Suggest** | Naming improvements, additional edge case, logging enhancement |

---

## Final Principle

A review is not a suggestion box. It is an architectural enforcement gate.

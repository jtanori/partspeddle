# VINTRACK — PR Governance

## Purpose

Defines pull request standards, size limits, and merge requirements. Keeps implementation velocity high without sacrificing coherence.

---

## PR Size Limits

| Metric | Max | Why |
|--------|-----|-----|
| Files changed | 15 | Larger PRs are unreviewable |
| Lines added | 400 | Focused changes are safer |
| Lines deleted | 200 | Refactors should be scoped |
| Domains touched | 1 | Cross-domain PRs require explicit approval |

**Exception:** Purely mechanical changes (renames, dependency updates) may exceed limits with reviewer approval.

---

## PR Template

```markdown
## Domain
Identity / Marketplace / Transactions / etc.

## Change
One-sentence description.

## Events Added/Modified
- `event.name` (version N)

## Schema Changes
- Table: `table_name` — added `column_name`

## Tests
- [ ] Unit tests added
- [ ] Integration tests added
- [ ] Event contract tests added

## Checklist
- [ ] Code review checklist complete
- [ ] No cross-domain imports
- [ ] RLS policies updated (if new table)
```

---

## Branch Naming

```
feat/identity-seller-onboarding
fix/transaction-escrow-timeout
refactor/marketplace-listing-state
docs/api-contract-update
```

---

## Merge Requirements

- [ ] All CI checks pass
- [ ] Code review checklist completed
- [ ] At least one approving review
- [ ] No unresolved blocking comments
- [ ] Branch is up to date with `main`

---

## Merge Strategy

**Squash and merge** for feature branches.

Commit message format:
```
feat(identity): add seller onboarding state machine

- Implements pending → onboarding → review → active transitions
- Adds onboarding_states table with step tracking
- Emits seller.activated on operational approval
```

---

## Prohibited PRs

- Draft PRs left open > 7 days (close or convert to issue)
- PRs with failing CI (merge blocked)
- PRs touching > 1 domain without architecture review
- PRs adding new dependencies without justification

---

## Final Principle

PRs are the last line of defense against architectural drift. Small, focused, and thoroughly reviewed.

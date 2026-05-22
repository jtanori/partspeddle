# Merge Strategy

> **Authority:** `REPOSITORY_GOVERNANCE_PROTOCOL.md`  
> **Purpose:** Define integration topology for reconstructed branches.  
> **Status:** Active

---

## Branch Topology

```
main
 └── develop
      ├── feature/T11.x-governance-runtime      (authority layer)
      ├── feature/runtime-infrastructure         (infra layer)
      ├── feature/T3.x-frontend-foundation       (frontend layer)
      └── feature/T2.x-planning                  (planning layer)
```

## Merge Order

Governance first. Everything else derives from it.

| Order | Branch | Rationale | Blockers |
|-------|--------|-----------|----------|
| 1 | `feature/T11.x-governance-runtime` | Authority layer. Tools, protocols, schemas. | None |
| 2 | `feature/runtime-infrastructure` | Depends on governance scripts (audit, projections). | T11.x merged |
| 3 | `feature/T3.x-frontend-foundation` | Depends on infra (package.json, configs). | Infrastructure merged |
| 4 | `feature/T2.x-planning` | Docs only. Lowest risk. Last. | T3.x merged |

## Merge Gates

Before any merge:

1. `repository.validate` → PASS
2. `tools/runtime/integrity-audit.sh` → PASS
3. Worktree clean on source branch
4. Rebased onto target branch tip
5. No merge conflicts in `package.json` or `package-lock.json`

## Rebase Rules

```bash
# Before merge, rebase onto target
git checkout feature/<branch>
git rebase main

# If conflicts in package-lock.json:
#   regenerate: rm package-lock.json && npm install
#   commit: git add package-lock.json && git rebase --continue
```

## Squash Policy

| Branch Type | Squash? | Rationale |
|-------------|---------|-----------|
| `feature/T11.x-*` | NO | Governance history must be preserved for audit |
| `feature/T3.x-*` | Optional | Feature work may squash if commits are noisy |
| `feature/runtime-*` | NO | Infrastructure changes must be bisectable |
| `feature/T2.x-*` | YES | Planning docs are low-risk, squash acceptable |
| `recovery/*` | N/A | Never merge. Archive only. |

## Recovery Branch Lifecycle

```
Create:  On contamination detection
Commit:  Full snapshot with RECOVERY prefix
Age:     30 days
Action:  Delete after all domains promoted
Rule:    NEVER merge recovery/* into main
```

## Promotion Path

```
feature/* → develop → main
```

MVP phase: merge directly to `main` (no develop gate).

Post-MVP: introduce `develop` as staging.

## Validation Sequence

After each merge:

1. `npm run lint` → PASS
2. `npm run typecheck` → PASS
3. `npm run test:unit` → PASS
4. `npm run pm:validate` → PASS
5. `tools/runtime/status.sh` → PASS

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-22 | Initial merge strategy. 4-branch topology, governance-first order, rebase rules, squash policy, recovery lifecycle. |

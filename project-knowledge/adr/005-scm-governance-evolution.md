# ADR-005: SCM Governance Evolution — From Documented Git Flow to Enforced Trunk-Based Governance

**Status:** Proposed → Accepted  
**Date:** 2026-05-25  
**Deciders:** VINTRACK Agent (governance reconciliation session)  
**Reference Commit:** `9efac54`

## Context

VINTRACK's `project-knowledge/git-workflow.md` (effective 2026-05-19) defines a strict three-tier Git Flow model:

```
feature/* → develop → main
```

With explicit rules:
- Direct commits to `develop` and `main` are forbidden
- Every ticket MUST be implemented in a `feature/*` branch
- Every merge requires a Pull Request with reviewer approval
- `develop` requires 1 approval; `main` requires 2 approvals

## Problem

The documented workflow is **not being followed**. Audit of the repository reveals:

| Metric | Documented Policy | Actual Practice |
|---|---|---|
| Active branches | `feature/*`, `develop`, `main` | `main` only |
| Direct commits to `main` | Forbidden | 50 of last 50 commits |
| Merge commits | Required for all promotion | 4 merges in entire history |
| `develop` branch | Required integration branch | **Does not exist** |
| Feature branches | One per ticket | None currently active |
| PR requirements | All merges | None used recently |

This constitutes **governance drift** between documented policy and operational reality. The workflow document has become tribal knowledge that contradicts actual practice.

## Root Cause Analysis

1. **Single-agent execution model**: Most development has been autonomous agent execution where branch creation overhead exceeds value.
2. **Pre-production velocity**: MVP phase prioritizes implementation speed over ceremony.
3. **No multi-agent collision**: With only one active execution stream, branch isolation has not been necessary.
4. **Governance document created before governance enforcement**: The workflow was designed aspirationally before CI, branch protection, or multi-agent execution existed.

## Decision

Evolve from three-tier Git Flow to **lightweight trunk-based governance** with progressive protection.

### Rationale

- Git Flow's `develop` branch provides no value when Vercel deploys directly from `main`
- Two approval requirements are impossible with current contributor count (1 human + agents)
- Feature branch overhead is unjustified for single-agent execution
- Trunk-based development with PR gates for significant changes matches actual velocity

### New Branch Taxonomy

```
main
├── feat/T{milestone}.{sequence}-{description}  → PR required
├── fix/T{milestone}.{sequence}-{description}   → PR required
├── gov/{description}                           → PR required
├── exp/{description}                           → PR optional
└── hotfix/{description}                        → PR post-hoc
```

| Branch Class | Purpose | Protection | Promotion |
|---|---|---|---|
| `main` | Stable, deployable, authoritative | Strictly protected | N/A |
| `feat/*` | Ticket-scoped implementation | Unprotected | PR → main |
| `fix/*` | Defect remediation | Unprotected | PR → main |
| `gov/*` | Governance, ADR, architectural changes | Unprotected | PR → main |
| `exp/*` | Experimental/research work | Unprotected | PR optional |
| `hotfix/*` | Emergency production fixes | Unprotected | Direct → main, PR post-hoc |

### Direct-to-Main Policy

**Prohibited without PR:**
- Cross-domain changes
- Governance-significant changes (CI, tsconfig, ADRs)
- Database schema changes
- Breaking API changes
- Multi-file refactors
- Dependency upgrades

**Allowed with passing CI:**
- Documentation-only changes (`docs:`, `chore(docs):`)
- Single-file trivial fixes (< 10 lines)
- Emergency fixes with ADR-traceable justification

**Forbidden always:**
- Force-pushing `main`
- Commits with failing CI
- Unpinned dependency additions
- Bypassing required checks

## Consequences

### Positive

- Matches actual operational practice
- Reduces branch management overhead for single-agent execution
- Maintains PR gate for significant changes
- Enables progressive protection as team grows
- Simpler Vercel deployment model (only `main`)

### Negative

- Less isolation than Git Flow for parallel feature development
- No built-in integration branch for multi-feature validation
- Requires discipline to use PRs for significant changes
- `hotfix/*` direct-to-main creates temporary integrity risk

### Mitigations

- CI gates enforce quality regardless of direct commit or PR
- `invariant-check.yml` provides governance validation on all `main` pushes
- ADR-005 itself requires PR (governance change)
- Future multi-agent execution can add `develop` branch if needed

## Transition Plan

### Phase 1 (Immediate)

- [x] Document actual practice (this ADR)
- [ ] Update `project-knowledge/git-workflow.md` to reflect trunk-based model
- [ ] Configure GitHub branch protection for `main`

### Phase 2 (Next Milestone)

- [ ] Require PRs for all `gov/*` branches
- [ ] Require PRs for all cross-domain changes
- [ ] Add commit signature verification

### Phase 3 (Multi-Agent Transition)

- [ ] Re-evaluate need for `develop` branch when >1 active agent
- [ ] Add required reviewer if human reviewer becomes available
- [ ] Consider release/* branches for staging environment

## Branch Protection Recommendations

### `main` (Immediate)

- ✅ Require PR before merging
- ✅ Require status checks to pass
  - `lint-and-typecheck`
  - `typecheck:frontend`
  - `unit-tests`
- ✅ Require branches to be up to date
- ✅ Restrict direct pushes (allow admin bypass for emergencies)
- ❌ Require signed commits (deferred — not yet enforced)
- ❌ Require approvals (deferred — no reviewers available)

### `main` (Future — M6+)

- Require 1 approval
- Require signed commits
- Dismiss stale approvals

## Relationship to ADR-004

ADR-004 established compiler surface separation. ADR-005 establishes source-control surface separation:

| ADR | Surface | Boundary |
|---|---|---|
| ADR-004 | TypeScript compilation | Frontend vs Backend tsconfig |
| ADR-005 | Source control | Main vs Feature branches |

Governance-significant changes (ADRs, CI, tsconfig) MUST touch both surfaces and therefore require PR review.

## Validation

```bash
# Branch naming validation
git branch --list 'feat/*' 'fix/*' 'gov/*' 'exp/*' 'hotfix/*'

# Commit convention validation
git log --format="%s" -20 | grep -E '^(feat|fix|chore|docs|test|refactor|governance|ci)\(.+\): .+ \(T[0-9]+\.[0-9]+\)'

# Direct commit detection
git log --oneline --no-merges -10 main
```

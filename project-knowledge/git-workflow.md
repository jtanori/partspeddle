# VINTRACK — Git Workflow & Branch Governance

> **Status:** Canonical Development Workflow  
> **Scope:** All contributors, agents, CI pipelines, and deployment promotion flows  
> **Effective:** 2026-05-25 (Updated from 2026-05-19 Git Flow model per ADR-005)  
> **ADR Reference:** [ADR-005: SCM Governance Evolution](../adr/005-scm-governance-evolution.md)

---

## 1. Purpose

Establish a deterministic Git branching and promotion model for VINTRACK.

This workflow exists to:

- Prevent unstable code from reaching protected branches
- Enforce ticket-level isolation
- Guarantee CI validation before promotion
- Preserve traceability between tickets, commits, branches, and releases
- Enable multi-agent parallel development safely

## 2. Branch Strategy

VINTRACK uses **trunk-based development** with short-lived feature branches:

```
feat/*  →  PR  →  main
fix/*   →  PR  →  main
gov/*   →  PR  →  main
```

| Branch      | Purpose                                | Protection Level    |
|-------------|----------------------------------------|---------------------|
| `main`      | Production-grade canonical branch      | Strictly protected  |
| `feat/*`    | Ticket-scoped implementation work      | Unprotected         |
| `fix/*`     | Defect remediation                     | Unprotected         |
| `gov/*`     | Governance and architectural changes   | Unprotected         |
| `exp/*`     | Experimental/research work             | Unprotected         |
| `hotfix/*`  | Emergency production fixes             | Unprotected         |

**Why no `develop` branch?**

- Vercel deploys directly from `main`
- Single-agent execution model does not require integration staging
- CI on `main` provides sufficient validation gate
- Can be introduced later when multi-agent concurrency demands it

### Historical Note

Prior to 2026-05-25, `git-workflow.md` specified a three-tier Git Flow model (`feature/* → develop → main`). This was aspirational but never operationalized. ADR-005 formally retired that model in favor of the current trunk-based approach.

---

## 3. Branch Naming Standard

### Feature Branches

```
feat/T{milestone}.{sequence}-{short-kebab-description}
```

Examples:
- `feat/T3.1-repository-restructure`
- `feat/T3.2-shared-contracts`
- `feat/T6.4-escrow-lifecycle`

### Fix Branches

```
fix/T{milestone}.{sequence}-{short-kebab-description}
```

### Governance Branches

```
gov/{description}
```

Examples:
- `gov/adr-004-typescript-surfaces`
- `gov/ci-frontend-typecheck`
- `gov/branch-protection-rules`

### Experimental Branches

```
exp/{description}
```

Examples:
- `exp/algolia-v8-migration`
- `exp/react-19-concurrent-features`

### Hotfix Branches

```
hotfix/{short-description}
```

---

## 4. Direct-to-Main Policy

### Prohibited Without PR

- Cross-domain changes
- Governance-significant changes (CI, tsconfig, ADRs)
- Database schema changes
- Breaking API changes
- Multi-file refactors
- Dependency upgrades

### Allowed With Passing CI

- Documentation-only changes (`docs:`, `chore(docs):`)
- Single-file trivial fixes (< 10 lines)
- Emergency fixes with ADR-traceable justification

### Forbidden Always

- Force-pushing `main`
- Commits with failing CI
- Unpinned dependency additions
- Bypassing required checks

---

## 5. Merge Flow

### Allowed Promotions

```
feat/*  →  main  (via PR)
fix/*   →  main  (via PR)
gov/*   →  main  (via PR)
exp/*   →  main  (via PR or direct for trivial experiments)
hotfix/* → main  (direct allowed, PR post-hoc required)
```

### Forbidden Promotions

```
feat/* → feat/*
main   → any branch
```

---

## 6. Pull Request Requirements

### Standard PR (feat/*, fix/*, gov/*)

Requirements:
- [ ] CI passes (`lint-and-typecheck`, `typecheck:frontend`, `unit-tests`)
- [ ] Branch up to date with `main`
- [ ] No merge conflicts
- [ ] Ticket acceptance criteria satisfied
- [ ] Conventional commit format used

### Hotfix PR (post-hoc)

Requirements:
- [ ] CI passes
- [ ] Emergency justification documented in PR description
- [ ] ADR or incident reference included
- [ ] Post-deployment validation plan specified

---

## 7. Commit Governance

### Commit Format

Use [Conventional Commits](https://www.conventionalcommits.org/) with a mandatory ticket reference:

```
{type}({domain}): {description} (T{milestone}.{sequence})
```

Examples:
```
feat(identity): implement User aggregate with email validation (T2.2)
fix(transactions): handle duplicate PaymentIntent idempotency (T6.3)
test(marketplace): add RLS integration tests for listings (T3.6)
governance(ci): harden typecheck enforcement (T3.2)
```

### Rules

- Commits MUST reference the ticket
- No vague commit messages
- No "fix stuff" commits
- Squash merges preferred for feature branches
- Governance changes MUST reference ADR number in PR description

---

## 8. GitHub Branch Protection Rules

### `main` (Current)

Enable:
- ✅ Require pull request before merging
- ✅ Require status checks to pass
  - `lint-and-typecheck`
  - `typecheck:frontend`
  - `unit-tests`
- ✅ Require branches to be up to date
- ✅ Restrict direct pushes (admin bypass for emergencies)
- ❌ Require signed commits (deferred)
- ❌ Require approvals (deferred — no reviewers available)

### `main` (Future — M6+)

Add:
- Require 1 approval
- Require signed commits
- Dismiss stale approvals

---

## 9. CI Workflow Integration

### Trigger Matrix — `ci.yml`

```yaml
on:
  pull_request:
    branches:
      - main

  push:
    branches:
      - main
```

**Purpose:**
- Validate PRs before merge
- Validate `main` integrity after merge
- Block broken code promotion

### Required CI Jobs

| Job | Purpose | Runtime Target |
|---|---|---|
| `lint-and-typecheck` | ESLint + backend typecheck + format check | < 5 min |
| `typecheck-frontend` | Frontend typecheck | < 2 min |
| `unit-tests` | Fast isolated verification | < 2 min |
| `integration-tests` | PostgreSQL + Redis + Queue validation | < 5 min |
| `frontend-build` | Next.js build verification | < 5 min |

---

## 10. Agent Operating Rules

All autonomous agents MUST:

- Create a branch before implementation (except trivial direct-to-main allowed changes)
- Never force-push `main`
- Keep changes scoped to assigned ticket
- Rebase before opening PR
- Run local validation before push
- Update traceability metadata
- Preserve architectural governance documents

Agents are **forbidden** from:

- Force-pushing protected branches
- Bypassing CI
- Disabling tests
- Modifying unrelated tickets
- Introducing unpinned dependencies
- Direct commits for governance-significant changes

---

## 11. Ticket Lifecycle

### Standard Lifecycle

```
planned → in_progress → review → approved → merged → released
```

A ticket is **NOT** considered complete until:

- Merged into `main`
- CI passes
- Traceability updated

---

## 12. Governance Summary

VINTRACK development governance principles:

- Ticket isolation via branches
- Deterministic promotion via PRs
- CI-enforced quality
- Immutable traceability
- Infrastructure reproducibility
- Strict `main` protection
- No implicit merges
- No unstable code in `main`
- ADR linkage for governance changes

This workflow is mandatory for all contributors and automation systems.

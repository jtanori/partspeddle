# VINTRACK — Git Workflow & Branch Governance

> **Status:** Canonical Development Workflow  
> **Scope:** All contributors, agents, CI pipelines, and deployment promotion flows  
> **Effective:** 2026-05-19

---

## 1. Purpose

Establish a deterministic Git branching and promotion model for VINTRACK.

This workflow exists to:

- Prevent unstable code from reaching protected branches
- Enforce ticket-level isolation
- Guarantee CI validation before promotion
- Preserve traceability between tickets, commits, branches, and releases
- Enable multi-agent parallel development safely

---

## 2. Branch Strategy

VINTRACK uses a strict three-tier branch model:

```
feature/*  →  develop  →  main
```

| Branch      | Purpose                                | Protection Level    |
|-------------|----------------------------------------|---------------------|
| `feature/*` | Ticket-scoped implementation work      | Unprotected         |
| `develop`   | Integration branch for validated work  | Protected           |
| `main`      | Production-grade canonical branch      | Strictly protected  |

**Direct commits to `develop` and `main` are forbidden.**

---

## 3. Feature Branch Naming Standard

Every ticket MUST be implemented in its own feature branch.

### Required Format

```
feature/T{x}-{short-kebab-description}
```

### Examples

- `feature/T1.4-queue-bootstrap`
- `feature/T1.5-supabase-pool`
- `feature/T2.1-identity-schema`
- `feature/T2.6A-hosted-auth-sync`

### Rules

- One ticket per branch
- No shared feature branches
- No multi-ticket implementation branches
- Branch names MUST remain immutable after creation

### Hotfixes

Hotfixes use:

```
hotfix/{short-description}
```

---

## 4. Merge Flow

### Allowed Promotions

```
feature/*  →  develop
develop    →  main
```

### Forbidden Promotions

```
feature/* → main
feature/* → feature/*
main      → develop
```

---

## 5. Pull Request Requirements

Every merge requires a Pull Request.

### Feature → Develop

Requirements:

- [ ] CI passes
- [ ] Branch up to date with `develop`
- [ ] No merge conflicts
- [ ] Ticket acceptance criteria satisfied
- [ ] At least one reviewer approval
- [ ] No failing checks

### Develop → Main

Requirements:

- [ ] Full CI passes
- [ ] Integration tests pass
- [ ] Release notes generated
- [ ] No open blocker defects
- [ ] Manual approval required

---

## 6. Commit Governance

### Commit Format

Use [Conventional Commits](https://www.conventionalcommits.org/) with a mandatory ticket reference:

```
{type}({domain}): {description} (T{milestone}.{sequence})
```

### Examples

```
feat(identity): implement User aggregate with email validation (T2.2)
fix(transactions): handle duplicate PaymentIntent idempotency (T6.3)
test(marketplace): add RLS integration tests for listings (T3.6)
```

### Rules

- Commits MUST reference the ticket
- No vague commit messages
- No "fix stuff" commits
- Squash merges preferred for feature branches

---

## 7. GitHub Branch Protection Rules

### `develop`

Enable:

- Require pull request before merging
- Require status checks to pass
- Require branches to be up to date
- Require conversation resolution
- Restrict direct pushes
- Require linear history
- Dismiss stale approvals on new commits

Required checks:

- `lint-and-typecheck`
- `unit-tests`
- `integration-tests`

### `main`

Enable:

- Require pull request before merging
- Require status checks to pass
- Require signed commits
- Require approvals (minimum 2)
- Restrict direct pushes
- Require linear history
- Include administrators
- Require deployment readiness review

Required checks:

- `lint-and-typecheck`
- `unit-tests`
- `integration-tests`
- `release-validation`

---

## 8. GitHub Actions CI/CD Workflow

### Workflow Structure

```
.github/workflows/
  ci.yml
  release.yml
```

---

## 9. CI Workflow Requirements

### Trigger Matrix — `ci.yml`

```yaml
on:
  pull_request:
    branches:
      - develop
      - main

  push:
    branches:
      - develop
```

**Purpose:**

- Validate feature branch merges
- Validate integration stability
- Block broken code promotion

---

## 10. Required CI Jobs

### `lint-and-typecheck`

**Purpose:**

- ESLint validation
- TypeScript strict validation
- Formatting verification

**Target runtime:** `< 30 seconds`

### `unit-tests`

**Purpose:**

- Fast isolated verification
- No infrastructure dependencies

**Target runtime:** `< 2 minutes`

### `integration-tests`

**Purpose:**

- PostgreSQL integration
- Redis integration
- Queue validation
- Outbox validation
- Migration verification

**Infrastructure:**

- PostgreSQL container
- Redis container

**Target runtime:** `< 5 minutes`

---

## 11. Release Workflow

### `release.yml`

```yaml
on:
  push:
    branches:
      - main
```

**Purpose:**

- Validate release readiness
- Generate artifacts
- Generate release metadata
- Prepare deployment pipeline integration

---

## 12. Merge Conflict Policy

If a feature branch diverges from `develop`:

```bash
git checkout feature/T2.4-identity-repositories
git fetch origin
git rebase origin/develop
```

Merge commits are discouraged.

**Preferred strategy:** `rebase` + `squash merge`

---

## 13. Ticket Lifecycle

### Standard Lifecycle

```
planned → in_progress → review → approved → merged → released
```

A ticket is **NOT** considered complete until:

- Merged into `develop`
- CI passes
- Traceability updated

---

## 14. Agent Operating Rules

All autonomous agents MUST:

- Create a feature branch before implementation
- Never commit directly to `develop` or `main`
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

---

## 15. Recommended GitHub Actions Enhancements

Future additions:

- Coverage thresholds
- Secret scanning
- SBOM generation
- Dependency vulnerability scanning
- Conventional release generation
- Container image signing
- Deployment promotion gates
- Preview environments

---

## 16. Minimal Example Workflow

### Feature Development

```bash
# Start work
git checkout develop
git pull

git checkout -b feature/T2.3-seller-onboarding

# Implement
npm run lint
npm run test

# Push
git push origin feature/T2.3-seller-onboarding

# Open PR → develop
```

### Release Promotion

```
develop
  ↓ PR + approvals + CI
main
```

---

## 17. Governance Summary

VINTRACK development governance principles:

- Ticket isolation
- Deterministic promotion
- CI-enforced quality
- Immutable traceability
- Infrastructure reproducibility
- Strict branch protection
- No implicit merges
- No unstable code in protected branches

This workflow is mandatory for all contributors and automation systems.

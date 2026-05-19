# VINTRACK — CI/CD Philosophy

## Purpose

Defines the continuous integration and delivery approach. MVP-focused: fast feedback, minimal infrastructure, no premature deployment complexity.

---

## CI Pipeline

### Stages (in order)

1. **Lint** — ESLint + Prettier + TypeScript strict check
2. **Unit Tests** — Vitest, coverage threshold 80%
3. **Integration Tests** — Test DB + Redis, coverage threshold 70%
4. **Schema Validation** — Supabase migrations dry-run
5. **Build** — TypeScript compilation

### Runtime Targets

| Stage | Target | Fail Action |
|-------|--------|-------------|
| Lint | < 30s | Block merge |
| Unit | < 2 min | Block merge |
| Integration | < 5 min | Block merge |
| Schema | < 1 min | Block merge |
| Build | < 1 min | Block merge |

### Parallelization

- Lint + Unit run in parallel
- Integration runs after Unit passes
- Schema + Build run after Integration passes

---

## CD Philosophy

### MVP Stage

- **Manual deployment** via Supabase CLI + GitHub Actions
- No automated production deploys
- Staging environment = `develop` branch
- Production environment = `main` branch + manual trigger

### Deployment Checklist

- [ ] CI passes on branch
- [ ] Migrations applied to staging and verified
- [ ] Smoke tests pass on staging
- [ ] Rollback plan documented (previous migration + revert commit)
- [ ] Deploy during low-traffic window

### Rollback

- Database: forward-only migration reversal (new migration file)
- Code: revert commit + redeploy
- Target: < 10 min rollback time

---

## Environment Strategy

| Environment | Purpose | Data |
|-------------|---------|------|
| Local | Development | Seeded test data |
| CI | Automated testing | Ephemeral per run |
| Staging | Pre-production validation | Anonymized production-like |
| Production | Live users | Real data |

**No shared databases between environments.**

---

## Dependency Management

- Pin exact versions in `package.json` (`"1.2.3"`, not `"^1.2.3"`)
- Dependabot weekly PRs for security patches
- Major version updates require architecture review
- No dependencies added without explicit justification in PR

---

## Final Principle

CI exists to catch mistakes, not replace thinking. Fast feedback loops beat comprehensive but slow pipelines.

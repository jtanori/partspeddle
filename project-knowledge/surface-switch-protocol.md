# VINTRACK — Surface Switch Protocol

> **Status:** Canonical Governance Document
> **Scope:** All engineers and agents working across execution surfaces
> **Effective:** 2026-05-19

---

## 1. Purpose

Formalize the mental model and verification steps required when moving work from one execution surface to another. Prevents cross-surface contamination, runtime violations, and architectural drift.

---

## 2. When This Applies

**Trigger:** Any PR that touches files in more than one surface:

```
src/backend/ + src/frontend/
src/backend/ + src/shared/
src/frontend/ + src/shared/
src/frontend/app/ (RSC) + src/frontend/app/ (client)
```

Also applies when:
- An engineer switches from backend work to frontend work in the same session
- An agent is reassigned from one surface ticket to another
- A shared contract is modified

---

## 3. The Seven Evaluations

Before committing code that crosses surfaces, re-evaluate:

### 3.1 Runtime Constraints

**Question:** Which APIs are available in the target surface? Which are forbidden?

| Surface | Available | Forbidden |
|---------|-----------|-----------|
| Backend | Node.js full APIs | None |
| Frontend RSC | Server-safe APIs | `window`, `document`, browser APIs |
| Frontend Client | Browser APIs | Node `fs`, `net`, `crypto` |
| Shared | Runtime-agnostic only | ALL runtime-specific APIs |

**Action:** Check `runtime-sovereignty.md` for detailed constraints.

### 3.2 Import Legality

**Question:** Is every import allowed per the direction matrix?

**Forbidden patterns:**
- `frontend/*` → `backend/*`
- `shared/*` → `frontend/*`
- `shared/*` → `backend/*`
- `frontend/client` → `frontend/rsc`

**Action:** Run `npm run lint` and verify `no-restricted-imports` passes.

### 3.3 Contract Ownership

**Question:** Am I consuming or defining? Who owns semantic truth?

**Rules:**
- Backend defines contracts; frontend consumes them
- Shared contracts are projections of backend domain semantics
- Frontend NEVER defines API types

**Action:** If adding a new type, it belongs in `src/shared/contracts/` and backend defines it.

### 3.4 Auth Assumptions

**Question:** Is this code server-side (JWT forwarded) or client-side (session context)?

| Surface | Auth Mechanism | Token Source |
|---------|---------------|--------------|
| Backend API | `Authorization: Bearer <jwt>` | Validated by Supabase |
| Frontend RSC | Session from cookie | `@supabase/ssr` |
| Frontend Client | Session from context | `AuthProvider` |

**Action:** Ensure auth token propagation matches the surface. Do not assume `localStorage` in RSC.

### 3.5 Caching Semantics

**Question:** Who invalidates? Who re-renders?

**Doctrine:** Backend owns WHAT to invalidate. Frontend owns WHEN and HOW to re-render.

**Action:** Check `cache-invalidation-ownership.md` for layer responsibilities.

### 3.6 Deployment Implications

**Question:** Does this change affect Vercel, backend compute, or both?

| Change Type | Affected Platform | CI Gates |
|------------|------------------|----------|
| Frontend only | Vercel | `frontend-build` |
| Backend only | Backend platform | `backend-unit-tests`, `backend-integration-tests` |
| Shared contracts | Both | All gates |
| Auth topology | Both | All gates + E2E |

**Action:** Ensure CI gates for affected platforms are included in PR.

### 3.7 Test Surface

**Question:** Which test layer validates this change?

| Code Location | Test Layer | Runner |
|--------------|-----------|--------|
| `src/backend/domain/` | Unit tests | Vitest |
| `src/backend/api/` | Integration tests | Vitest + Postgres |
| `src/frontend/components/` | Component tests | Vitest + RTL |
| `src/frontend/app/` | E2E tests | Playwright |
| `src/shared/contracts/` | Contract tests | Vitest |

**Action:** Add or update tests for the correct layer.

---

## 4. PR Description Template

For cross-surface PRs, include this section:

```markdown
## Surface Switch Review

- [ ] Runtime constraints verified
- [ ] Import legality verified (`npm run lint` passes)
- [ ] Contract ownership documented
- [ ] Auth assumptions match surface
- [ ] Caching semantics documented
- [ ] Deployment implications noted
- [ ] Tests added for correct layer

### Surfaces Touched
- [ ] Backend
- [ ] Frontend RSC
- [ ] Frontend Client
- [ ] Shared Contracts
- [ ] CI/CD
```

---

## 5. Agent Context Reset

When an AI agent switches from one surface to another:

1. **STOP** — Do not accumulate context from previous surface
2. **Read surface-specific governance** — `runtime-sovereignty.md`, `import-direction-matrix.md`
3. **Re-evaluate the seven checks** — Runtime, imports, contracts, auth, cache, deploy, tests
4. **Confirm understanding** — State which surface you're now working in

---

## 6. Exceptions

If a change legitimately requires cross-surface coupling:

1. Document the exception in PR with architecture rationale
2. Create follow-up ticket to decouple if possible
3. Requires staff engineer approval
4. Log in `project-management/lessons.md`

---

## 7. Review Checklist

For reviewers of cross-surface PRs:

- [ ] PR description includes Surface Switch Review section
- [ ] No forbidden imports detected
- [ ] Runtime-appropriate APIs used
- [ ] Auth flows correctly per surface
- [ ] Cache ownership respected
- [ ] Tests cover all touched surfaces
- [ ] No secrets in `NEXT_PUBLIC_*`

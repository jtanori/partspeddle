# VINTRACK — Import Direction Matrix

> **Status:** Canonical Governance Document
> **Scope:** All TypeScript/TSX imports across surfaces
> **Effective:** 2026-05-19

---

## 1. Purpose

Formalize which layers may import from which other layers. Prevent cross-surface contamination, circular dependencies, and architectural drift.

---

## 2. Layer Definitions

| Layer | Path Pattern | Runtime |
|-------|-------------|---------|
| `backend/domain` | `src/backend/*/domain/` | `backend-node` |
| `backend/application` | `src/backend/*/application/` | `backend-node` |
| `backend/infrastructure` | `src/backend/*/infrastructure/` | `backend-node` |
| `backend/api` | `src/backend/*/api/` | `backend-node` |
| `frontend/rsc` | `src/frontend/app/**/*.tsx` (no directive) | `frontend-rsc` |
| `frontend/client` | `src/frontend/app/**/*.tsx` + `"use client"`, `src/frontend/hooks/` | `frontend-client` |
| `frontend/shared` | `src/frontend/lib/`, `src/frontend/components/` | Mixed |
| `shared/contracts` | `src/shared/contracts/` | `shared-runtime` |
| `shared/constants` | `src/shared/constants/` | `shared-runtime` |
| `shared/feature-flags` | `src/shared/feature-flags/` | `shared-runtime` |

---

## 3. Allowed Import Matrix

| From Layer → | `backend/domain` | `backend/app` | `frontend/client` | `frontend/rsc` | `frontend/shared` | `shared/*` |
|-------------|----------------|---------------|-------------------|----------------|-------------------|------------|
| `backend/domain` | ✅ Same domain | ❌ | ❌ | ❌ | ❌ | ✅ `shared/contracts`, `shared/constants` |
| `backend/application` | ✅ Same domain | ❌ | ❌ | ❌ | ❌ | ✅ `shared/*` |
| `backend/infrastructure` | ✅ Same domain | ✅ Same domain | ❌ | ❌ | ❌ | ✅ `shared/*` |
| `backend/api` | ✅ Same domain | ✅ Same domain | ❌ | ❌ | ❌ | ✅ `shared/*` |
| `frontend/client` | ❌ | ❌ | ✅ Same domain | ❌ | ✅ | ✅ `shared/contracts`, `shared/constants` |
| `frontend/rsc` | ❌ | ❌ | ❌ | ✅ Same domain | ✅ | ✅ `shared/contracts`, `shared/constants` |
| `frontend/shared` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ `shared/contracts`, `shared/constants` |
| `shared/*` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ `shared/*` only |

**Legend:**
- ✅ = Allowed
- ❌ = Forbidden (enforced by ESLint)
- "Same domain" = Within the same bounded context (e.g., `src/backend/identity/`)

---

## 4. Explicitly Forbidden Patterns

### 4.1 Frontend → Backend

```typescript
// FORBIDDEN
import { UserRepository } from '../../../backend/identity/infrastructure/persistence/user-repository.js';
```

**Why:** Frontend must consume backend through API contracts only, not implementation details.

### 4.2 Shared → Frontend or Backend

```typescript
// FORBIDDEN in src/shared/
import { useAuth } from '../../frontend/hooks/use-auth.js';
import { createClient } from '../../backend/shared/supabase/client.js';
```

**Why:** Shared code must be runtime-agnostic.

### 4.3 Frontend Client → Frontend RSC

```typescript
// FORBIDDEN in a "use client" file
import { ServerComponent } from '../server-component.js';
```

**Why:** RSCs cannot be imported into client components. This causes build errors or hydration mismatches.

### 4.4 Cross-Domain Backend Imports

Already enforced by existing ESLint rule:

```typescript
// FORBIDDEN
import { Listing } from '../../marketplace/domain/entities/listing.js';
```

**Why:** Bounded contexts communicate via events only.

---

## 5. ESLint Enforcement

Add to `eslint.config.js`:

```js
{
  rules: {
    'no-restricted-imports': ['error', {
      zones: [
        // Frontend cannot import backend
        {
          target: 'src/frontend',
          from: 'src/backend',
          message: 'Frontend cannot import backend implementation. Use shared/contracts or API layer.',
        },
        // Shared cannot import frontend
        {
          target: 'src/shared',
          from: 'src/frontend',
          message: 'Shared code must be runtime-agnostic.',
        },
        // Shared cannot import backend
        {
          target: 'src/shared',
          from: 'src/backend',
          message: 'Shared code must be runtime-agnostic.',
        },
      ],
    }],
  },
}
```

---

## 6. Exception Process

If a legitimate case requires a forbidden import:

1. Document the exception in PR description with architecture rationale
2. Add inline `eslint-disable-next-line no-restricted-imports` with comment explaining why
3. Requires staff engineer approval
4. Exception logged in `project-management/lessons.md`

---

## 7. Validation

### Build-Time
- `npm run lint` enforces import rules
- `npm run typecheck` catches type-level violations

### CI
- Import direction violations block PR merge
- No blanket exceptions permitted

---

## 8. Circular Dependency Prevention

If two modules in different layers need to reference each other:

1. **Preferred:** Extract shared contract to `src/shared/contracts/`
2. **Alternative:** Use dependency inversion (interface in consumer, implementation in provider)
3. **Forbidden:** Direct mutual imports

---

## 9. Review Checklist

For any PR touching multiple layers:

- [ ] No frontend → backend imports
- [ ] No shared → frontend/backend imports
- [ ] No client → RSC imports
- [ ] All cross-domain communication uses events or shared contracts
- [ ] ESLint passes with zero errors

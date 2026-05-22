# VINTRACK — Contract Evolution Policy

> **Status:** Canonical Governance Document
> **Scope:** Shared contracts, API contracts, event contracts
> **Effective:** 2026-05-19

---

## 1. Purpose

Prevent contract drift, fragmentation, and breaking changes that destabilize cross-surface integration. Establish who owns semantic truth and how contracts evolve safely.

---

## 2. Canonical Contract Sovereignty

**Doctrine:** The backend domain layer owns semantic truth. Shared contracts in `src/shared/contracts/` are projections of backend domain semantics.

**Frontend may:**
- Compose data for presentation
- Transform shapes for UI convenience
- Aggregate multiple backend responses

**Frontend may NEVER:**
- Define its own API types
- Create "temporary client types" that bypass shared contracts
- Duplicate Zod schemas
- Interpret events with different semantics than backend

---

## 3. Contract Change Taxonomy

| Change | Classification | Frontend Impact | Approval Required |
|--------|---------------|-----------------|-------------------|
| Add optional field | Non-breaking | None | Ticket author + 1 reviewer |
| Add required field | Breaking | Must update request builders | Architecture review |
| Remove field | Breaking | Must remove consumption | Architecture review + migration ticket |
| Rename field | Breaking | Must update all references | Architecture review + migration ticket |
| Change field type (widening) | Potentially breaking | May need parser updates | Domain lead review |
| Change field type (narrowing) | Breaking | May break existing data | Architecture review |
| Enum expansion | Potentially breaking | Switch statements need default | Domain lead review |
| Enum contraction | Breaking | Must remove references | Architecture review + rollout plan |
| Change validation rules | Potentially breaking | May fail existing requests | Integration test validation |
| Change event payload shape | Breaking | Event consumers must update | Architecture review + consumer notification |

---

## 4. Rollout Coordination

### 4.1 Non-Breaking Changes

1. Backend implements change in feature branch
2. Shared contracts updated in same branch
3. Frontend updates consumption (same PR or follow-up ticket within 48 hours)
4. E2E tests validate
5. Merge to `develop`

### 4.2 Breaking Changes

1. Create ADR documenting rationale and migration path
2. Create backend ticket for contract change
3. Create frontend ticket for consumption update
4. Backend deploys first (feature flag if possible)
5. Frontend updates within same release window
6. E2E tests validate cross-surface compatibility
7. Mobile (future) added to notification list
8. Merge both tickets together or in rapid sequence

### 4.3 Versioning

For MVP, use **timestamp-based versioning** (not semver):

```typescript
// src/shared/contracts/version.ts
export const CONTRACT_VERSION = '20260519';
```

Post-MVP, consider migrating to semantic versioning if external consumers emerge.

---

## 5. Anti-Patterns

| Anti-Pattern | Why Forbidden | Detection |
|-------------|--------------|-----------|
| `frontend/lib/types.ts` parallel to shared contracts | Contract drift | ESLint + code review |
| "Temporary" client types that never migrate | Technical debt | Weekly contract audit |
| Shadow Zod schemas in frontend | Inconsistent validation | `no-restricted-imports` |
| Frontend regex ≠ backend regex | Validation mismatch | Shared contracts enforcement |
| Frontend interpreting events differently | Semantic drift | Event catalog comparison |
| Backend changing contract without frontend ticket | Broken UI | PR checklist + architecture review |

---

## 6. Shared Contract Structure

```
src/shared/contracts/
  identity/
    user-schema.ts
    profile-schema.ts
    seller-schema.ts
  marketplace/
    listing-schema.ts
    catalog-schema.ts
  search/
    search-result-schema.ts
  events/
    identity-events.ts
    marketplace-events.ts
  index.ts          # Public exports
```

**Rule:** Every contract file exports:
- Zod schema
- Inferred TypeScript type
- Example valid object (for tests)

```typescript
// src/shared/contracts/identity/user-schema.ts
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  status: z.enum(['active', 'suspended', 'deactivated']),
});

export type User = z.infer<typeof UserSchema>;

export const userExample = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'user@example.com',
  status: 'active',
};
```

---

## 7. Change Notification

When a shared contract changes, notify:

1. Frontend engineers (via PR description tag: `@frontend`)
2. E2E test owners (contract changes require E2E updates)
3. Documentation (if API docs exist)
4. Mobile team (future)

---

## 8. Review Checklist

For any PR touching `src/shared/contracts/`:

- [ ] Change classified (breaking vs non-breaking)
- [ ] Frontend consumption updated or ticket created
- [ ] E2E tests updated or ticket created
- [ ] Event consumers updated (if event contract changed)
- [ ] Example objects updated
- [ ] No shadow schemas exist in frontend
- [ ] ADR created for breaking changes

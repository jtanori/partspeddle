# VINTRACK — Feature Flag Governance

> **Status:** Canonical Governance Document
> **Scope:** Progressive rollout, kill switches, experimentation, migration safety
> **Effective:** 2026-05-19

---

## 1. Purpose

Enable safe progressive delivery of features across an operationally complex platform without requiring full deployments for every change.

---

## 2. Location

```
src/shared/feature-flags/
  index.ts          # Flag definitions and types
  defaults.ts       # Default flag values
  evaluator.ts      # Runtime evaluation logic
```

---

## 3. Flag Types

For MVP, use **simple boolean flags** (TypeScript discriminated unions):

```typescript
// src/shared/feature-flags/index.ts
export interface FeatureFlags {
  sellerDashboardV2: boolean;
  advancedSearch: boolean;
  stripeConnectBeta: boolean;
  aiImageEnrichment: boolean;
}

export const DEFAULT_FLAGS: FeatureFlags = {
  sellerDashboardV2: false,
  advancedSearch: false,
  stripeConnectBeta: false,
  aiImageEnrichment: false,
};

export type FeatureFlagKey = keyof FeatureFlags;
```

**Post-MVP:** Consider percentage rollouts, user segments, or LaunchDarkly integration.

---

## 4. Governance Rules

### 4.1 Flag Definition

- Flags live in `src/shared/feature-flags/` (both surfaces read same definition)
- Backend evaluates flags for API behavior changes
- Frontend reads flags for UI conditional rendering
- Flags require ADR for introduction
- Removal ticket required for cleanup

### 4.2 Backend Usage

```typescript
import { DEFAULT_FLAGS } from '../../../shared/feature-flags/index.js';

export function createListing(dto: CreateListingDto, flags: FeatureFlags): Promise<Listing> {
  if (flags.aiImageEnrichment) {
    // Enqueue AI enrichment job
  }
  return repository.save(dto);
}
```

### 4.3 Frontend Usage

```typescript
import { DEFAULT_FLAGS } from '@/shared/feature-flags';

export function ListingForm() {
  const flags = useFeatureFlags(); // Reads from API or build-time config

  return (
    <form>
      <input name="title" />
      {flags.aiImageEnrichment && <AiEnrichmentButton />}
    </form>
  );
}
```

---

## 5. Use Cases

| Use Case | Example Flag | Owner |
|----------|-------------|-------|
| Progressive rollout | `sellerDashboardV2` | Product |
| Kill switch | `advancedSearch` | Engineering |
| Experimentation | `aiImageEnrichment` | Data Science |
| Migration safety | `stripeConnectBeta` | Engineering |
| Staged deployment | `newCheckoutFlow` | Engineering |

---

## 6. Lifecycle

```
ADR approved → Flag defined → Backend implements → Frontend implements →
  → Gradual rollout (dev → staging → prod %) → Monitor →
  → 30 days stable → Removal ticket → Cleanup PR → Flag deleted
```

### 6.1 Graduation Criteria

A flag graduates (is removed) when:
- It has been `true` in production for 30 days with no issues
- No rollback scenarios remain
- All stakeholders approve removal

### 6.2 Removal Process

1. Create removal ticket
2. Remove flag checks from backend
3. Remove flag checks from frontend
4. Delete flag from `src/shared/feature-flags/`
5. Update ADR with removal timestamp

---

## 7. Anti-Patterns

| Anti-Pattern | Why Forbidden |
|-------------|--------------|
| Feature flag as permanent configuration | Creates technical debt |
| Frontend flag not mirrored in backend | UI shows feature that API rejects |
| Backend flag not mirrored in frontend | API supports feature that UI hides |
| Flags in database without typed schema | Type safety lost |
| No removal ticket at creation | Flags accumulate forever |

---

## 8. Review Checklist

For any PR introducing a feature flag:

- [ ] ADR created for flag introduction
- [ ] Flag defined in `src/shared/feature-flags/`
- [ ] Backend evaluation implemented
- [ ] Frontend conditional rendering implemented
- [ ] Removal ticket created
- [ ] Default value is `false` (opt-in)
- [ ] Both surfaces use same flag definition

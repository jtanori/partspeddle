# VINTRACK — Cache Invalidation Ownership

> **Status:** Canonical Governance Document
> **Scope:** All caching layers across backend and frontend
> **Effective:** 2026-05-19

---

## 1. Purpose

Prevent cache invalidation chaos by explicitly defining WHO owns WHAT at each layer. Cache invalidation is one of the hardest problems in distributed systems; social coordination makes it harder.

---

## 2. Ownership Doctrine

> **The backend owns WHAT to invalidate. The frontend owns WHEN and HOW to re-render.**

No frontend code reaches into backend cache internals. No backend code assumes frontend rendering behavior.

---

## 3. Cache Layer Matrix

| Cache Layer | Owner | Mechanism | Invalidation Trigger |
|------------|-------|-----------|---------------------|
| Backend query cache | Backend | `unstable_cache` + `revalidateTag` | Domain events |
| Backend response cache | Backend | CDN cache headers (`stale-while-revalidate`) | TTL + explicit purge |
| Frontend rendering cache | Frontend | Next.js `cacheLife`, `cacheTag` | Time-based or route-based |
| Frontend data cache (future) | Frontend | TanStack Query `queryClient` | Mutation callbacks |
| API response cache | Backend | CDN + `Cache-Control` headers | Backend-controlled TTL |
| Database query cache | Postgres | Automatic | Not managed |

---

## 4. Backend Responsibilities

### 4.1 What to Invalidate

When a domain event occurs, the backend determines which cached data is stale:

```typescript
// Example: Listing published → invalidate listing cache
await revalidateTag('listings');
await revalidateTag(`listing-${listingId}`);
```

### 4.2 How to Signal

Backend emits domain events that carry invalidation hints:

```typescript
{
  eventType: 'marketplace.listing.published',
  payload: { listingId: '...' },
  metadata: {
    invalidateTags: ['listings', 'listing-...'],
  },
}
```

### 4.3 What NOT to Do

- Do NOT call frontend revalidation endpoints directly
- Do NOT assume frontend cache keys or structure
- Do NOT invalidate frontend rendering caches

---

## 5. Frontend Responsibilities

### 5.1 When to Re-Render

Frontend decides how aggressively to refetch based on UX requirements:

```typescript
// RSC: Revalidate every 60 seconds
export const revalidate = 60;

// Or use cache tags for targeted revalidation
export default async function ListingPage() {
  const listing = await unstable_cache(
    () => fetchListing(id),
    [`listing-${id}`],
    { revalidate: 3600, tags: [`listing-${id}`] }
  )();
}
```

### 5.2 How to Re-Render

- **Static pages:** Time-based revalidation (`revalidate`)
- **Dynamic pages:** `revalidateTag` + `revalidatePath`
- **Client components:** `router.refresh()` or mutation callbacks

### 5.3 What NOT to Do

- Do NOT call backend cache purge APIs
- Do NOT assume backend cache TTLs
- Do NOT invalidate CDN caches directly

---

## 6. Cross-Surface Coordination

### 6.1 Event-Driven Invalidation

```
Backend domain event
  → Event bus
    → Backend invalidates its query cache
    → Frontend (future) receives event via realtime
      → Frontend decides to refetch or revalidate
```

### 6.2 API Contract

Backend API responses include cache metadata:

```http
HTTP/1.1 200 OK
Cache-Control: public, s-maxage=60, stale-while-revalidate=300
X-Cache-Tags: listings, listing-123
```

Frontend uses `Cache-Control` for its own caching decisions.

---

## 7. Anti-Patterns

| Anti-Pattern | Why Forbidden |
|-------------|--------------|
| Frontend calling Redis directly | Violates ownership boundary |
| Backend forcing `router.refresh()` | Backend should not know frontend internals |
| Hardcoded TTLs in frontend | Should come from API contracts |
| Cache invalidation without events | Creates invisible dependencies |
| Frontend cache keys matching backend cache keys | Couples implementations |

---

## 8. Review Checklist

For any PR introducing caching:

- [ ] Cache layer identified (backend query, frontend render, CDN, etc.)
- [ ] Owner documented (backend or frontend)
- [ ] Invalidation trigger defined (event, TTL, manual)
- [ ] No cross-surface cache manipulation
- [ ] Cache-Control headers set for API responses (if applicable)
- [ ] Stale-while-revalidate used for graceful degradation

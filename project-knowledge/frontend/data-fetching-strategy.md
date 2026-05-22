# VINTRACK — Frontend Data Fetching Strategy

> **Status:** Canonical Governance Document
> **Scope:** All data fetching in frontend code
> **Effective:** 2026-05-19

---

## 1. Purpose

Prevent premature client-state complexity, duplicated cache systems, and hydration chaos by establishing a clear server-first data fetching hierarchy.

---

## 2. Default Strategy: Server-First

### 2.1 RSC Fetches Data Directly

React Server Components fetch data directly without client-side data libraries:

```tsx
// src/frontend/app/page.tsx
import { marketplaceApi } from '@/frontend/lib/api/marketplace';

export default async function HomePage() {
  const listings = await marketplaceApi.getFeaturedListings();
  return <ListingGrid listings={listings} />;
}
```

**Why:** Zero client JavaScript for data fetching. Zero hydration mismatches. Zero client-state management.

### 2.2 Next.js Cache

Use Next.js built-in caching for backend API calls:

```tsx
import { unstable_cache } from 'next/cache';

const getCachedListings = unstable_cache(
  async () => marketplaceApi.getFeaturedListings(),
  ['featured-listings'],
  { revalidate: 60, tags: ['listings'] }
);
```

---

## 3. Server Actions for Mutations

Use Server Actions for mutations from RSC pages:

```tsx
// src/frontend/app/listings/[id]/page.tsx
'use server';

import { marketplaceApi } from '@/frontend/lib/api/marketplace';

export async function purchaseListing(formData: FormData) {
  const listingId = formData.get('listingId') as string;
  await marketplaceApi.purchaseListing(listingId);
}
```

**When to use Server Actions:**
- Simple form submissions
- Mutations that don't need optimistic UI
- Actions that benefit from server-side validation

---

## 4. Deferred Strategies

The following are **explicitly deferred** until specific conditions are met:

### 4.1 TanStack Query (React Query)

**Introduce ONLY when:**
- Optimistic updates become common
- WebSocket sync becomes frequent
- Client-side mutation complexity increases
- Offline-first behavior emerges

**Do NOT introduce for:**
- Simple data reads (RSC handles this)
- Static pages
- Admin dashboards with simple CRUD

### 4.2 Global Client-State Libraries

**Forbidden for MVP:**
- Redux
- Zustand
- Jotai
- Recoil

**Rationale:** Server-first architecture makes global client state unnecessary. Local component state + URL state + RSC data covers 95% of MVP needs.

### 4.3 Random `fetch()` Calls

**Forbidden:** Direct `fetch()` calls from components. ALL backend communication flows through `src/frontend/lib/api/`.

---

## 5. Decision Matrix

| Scenario | Strategy | Why |
|----------|----------|-----|
| Page-level data | RSC + `lib/api/` | Zero client JS |
| Static data | `unstable_cache` | Build-time or periodic revalidation |
| Real-time data | Server-Sent Events / WebSocket (future) | Push instead of poll |
| Form submission | Server Action | Server-side validation |
| Complex form with client validation | `"use client"` + `useState` + `lib/api/` | Interactivity required |
| Search with filters | URL state + RSC | Shareable, bookmarkable |
| Dashboard with live updates | Defer: TanStack Query | When real-time needs emerge |
| Offline-first form | Defer: TanStack Query | When offline needs emerge |

---

## 6. Caching Strategy

| Cache Type | Owner | Mechanism | Invalidation |
|-----------|-------|-----------|--------------|
| RSC render cache | Next.js | `unstable_cache` | `revalidateTag` |
| API response cache | Backend | CDN headers | Backend events |
| Client cache (future) | TanStack Query | `queryClient` | Mutation callbacks |
| Browser cache | Browser | `Cache-Control` | HTTP semantics |

---

## 7. Anti-Patterns

| Anti-Pattern | Why Forbidden |
|-------------|--------------|
| `useEffect` + `fetch` in client components | Use RSC or Server Actions instead |
| `fetch('/v1/...')` directly | No typing, no auth, no error handling |
| SWR/TanStack Query for static pages | Unnecessary complexity |
| Global state for server-fetched data | Duplicates RSC data |
| Client-side data fetching for SEO-critical content | Hurts performance and SEO |

---

## 8. Review Checklist

For any PR adding data fetching:

- [ ] RSC used for page-level data when possible
- [ ] Server Actions used for simple mutations
- [ ] No `fetch()` directly in components
- [ ] `unstable_cache` used for expensive or repeated queries
- [ ] No global client-state library introduced
- [ ] URL state used for filterable/searchable pages

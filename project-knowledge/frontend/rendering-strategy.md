# VINTRACK — Frontend Rendering Strategy

> **Status:** Canonical Governance Document
> **Scope:** React Server Components, Client Components, SSR, and hydration
> **Effective:** 2026-05-19

---

## 1. Purpose

Maximize performance, minimize client JavaScript, and prevent hydration issues by establishing clear rules for when to use React Server Components vs Client Components.

---

## 2. Default: React Server Components (RSC)

**All components are Server Components by default.** No directive needed.

RSCs:
- Fetch data directly
- Access backend resources
- Render HTML on the server
- Send ZERO JavaScript to the browser

```tsx
// Server Component (default)
export default async function ListingPage({ params }: { params: { id: string } }) {
  const listing = await marketplaceApi.getListing(params.id);
  return <ListingDetail listing={listing} />;
}
```

---

## 3. When to Use Client Components

Add `"use client"` ONLY for:

| Use Case | Example |
|----------|---------|
| Browser APIs | `localStorage`, `navigator`, `window`, geolocation |
| Auth state | Session context, auth provider |
| Forms with complex validation | Multi-step forms, real-time validation |
| Real-time UI | WebSocket connections, live updates |
| User interactions requiring state | Drag-and-drop, image cropping |
| Third-party client libraries | Maps, charts, rich text editors |

```tsx
'use client';

import { useAuth } from '@/frontend/hooks/use-auth';

export function UserMenu() {
  const { user, signOut } = useAuth();
  return (
    <div>
      <span>{user?.email}</span>
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}
```

---

## 4. Suspense Boundaries

Wrap data fetching in Suspense for progressive loading:

```tsx
import { Suspense } from 'react';

export default function HomePage() {
  return (
    <div>
      <Header />
      <Suspense fallback={<ListingGridSkeleton />}>
        <FeaturedListings />
      </Suspense>
      <Suspense fallback={<ReviewSkeleton />}>
        <RecentReviews />
      </Suspense>
    </div>
  );
}
```

---

## 5. Streaming SSR

Next.js automatically streams RSC output. Slow data fetches don't block fast ones.

```tsx
// Both components fetch in parallel and stream as ready
<Suspense fallback={<Skeleton />}>
  <SlowDataComponent />  {/* Takes 2s */}
</Suspense>
<Suspense fallback={<Skeleton />}>
  <FastDataComponent />  {/* Takes 200ms */}
</Suspense>
```

---

## 6. Anti-Patterns

| Anti-Pattern | Why Forbidden | Correct Approach |
|-------------|--------------|----------------|
| `"use client"` for data fetching | Adds unnecessary JS | RSC fetches data |
| `"use client"` for static content | Adds unnecessary JS | RSC renders HTML |
| `useEffect` + `fetch` | Hydration risk, double fetch | RSC or Server Action |
| `typeof window` in RSC | Breaks SSR | Move to client component |
| `localStorage` in RSC | Breaks SSR | Move to client component |
| Client component as page root | Defeats RSC benefits | Keep pages as RSC |

---

## 7. Review Checklist

For any PR adding components:

- [ ] Default to Server Component (no directive)
- [ ] `"use client"` justified by specific use case
- [ ] No browser APIs in RSC
- [ ] Suspense boundary for async data
- [ ] No `useEffect` + `fetch` patterns

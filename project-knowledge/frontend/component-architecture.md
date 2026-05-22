# VINTRACK — Frontend Component Architecture

> **Status:** Canonical Governance Document
> **Scope:** Component organization, design methodology, and boundaries
> **Effective:** 2026-05-19

---

## 1. Purpose

Establish a scalable component organization that aligns with VINTRACK's bounded context architecture while supporting atomic design principles.

---

## 2. Design Methodology: Atomic Design

Components organized by atomic design hierarchy:

| Level | Location | Examples | Runtime |
|-------|----------|----------|---------|
| Atoms | `components/ui/` | Button, Input, Badge | Client (usually) |
| Molecules | `components/ui/` | Card, FormField, SearchInput | Client or RSC |
| Organisms | `components/{domain}/` | ListingCard, UserProfile, SearchFilters | RSC (default) |
| Templates | `app/{route}/layout.tsx` | PageLayout, DashboardLayout | RSC |
| Pages | `app/{route}/page.tsx` | HomePage, SearchPage | RSC |

---

## 3. Directory Structure

```
src/frontend/components/
  ui/                     # shadcn/ui primitives + molecules
    button.tsx
    input.tsx
    card.tsx
    dialog.tsx
    form.tsx
    skeleton.tsx
    ...
  identity/               # Identity domain components
    user-avatar.tsx
    seller-badge.tsx
    onboarding-progress.tsx
  marketplace/            # Marketplace domain components
    listing-card.tsx
    listing-grid.tsx
    price-display.tsx
  search/                 # Search domain components
    search-input.tsx
    filter-sidebar.tsx
    result-list.tsx
  layout/                 # Cross-cutting layout components
    header.tsx
    footer.tsx
    navigation.tsx
```

---

## 4. Component Rules

### 4.1 Server Components as Default

All domain components are Server Components unless they need:
- Browser APIs
- Auth state
- Complex client-side state
- Event handlers

```tsx
// Server Component (default)
// src/frontend/components/marketplace/listing-card.tsx
export function ListingCard({ listing }: { listing: Listing }) {
  return (
    <Card>
      <Image src={listing.imageUrl} alt={listing.title} />
      <h3>{listing.title}</h3>
      <PriceDisplay price={listing.price} />
    </Card>
  );
}
```

### 4.2 Client Components Explicitly Marked

```tsx
'use client';

// src/frontend/components/marketplace/favorite-button.tsx
export function FavoriteButton({ listingId }: { listingId: string }) {
  const [isFavorite, setIsFavorite] = useState(false);

  return (
    <Button onClick={() => setIsFavorite(!isFavorite)}>
      {isFavorite ? '❤️' : '🤍'}
    </Button>
  );
}
```

### 4.3 Container/Presenter Pattern

- **Containers (RSC):** Fetch data, handle server logic, pass data to presenters
- **Presenters (RSC or Client):** Receive props, render UI, handle user interactions

```tsx
// Container (RSC)
export default async function ListingPage({ params }: { params: { id: string } }) {
  const listing = await marketplaceApi.getListing(params.id);
  return <ListingDetail listing={listing} />;
}

// Presenter (RSC with client interactivity)
export function ListingDetail({ listing }: { listing: Listing }) {
  return (
    <div>
      <h1>{listing.title}</h1>
      <FavoriteButton listingId={listing.id} />
    </div>
  );
}
```

---

## 5. shadcn/ui Integration

### 5.1 Installation

```bash
npx shadcn-ui@latest init
npx shadcn-ui@latest add button input card dialog form
```

### 5.2 Customization

- Base primitives live in `components/ui/`
- Override styles via Tailwind config
- Add domain-specific variants in domain component folders
- Never modify shadcn/ui source directly; extend instead

---

## 6. Component Boundaries

### 6.1 Cross-Domain Rules

- Identity components may NOT import marketplace logic
- Marketplace components may NOT import transaction logic
- All cross-domain communication goes through shared contracts

### 6.2 Shared UI Components

`components/ui/` contains:
- shadcn/ui primitives
- Domain-agnostic molecules
- No business logic
- No domain-specific types

---

## 7. Storybook Policy

**Deferred.** Add Storybook only when:
- Design system exceeds ~30 components
- Multiple designers/engineers need visual reference
- Visual regression testing becomes valuable

**For MVP:** Component tests + E2E tests provide sufficient coverage.

---

## 8. Naming Conventions

| Pattern | Example | Usage |
|---------|---------|-------|
| PascalCase | `ListingCard.tsx` | Components |
| camelCase | `useAuth.ts` | Hooks |
| kebab-case | `listing-card.tsx` | File names (preferred) |
| `*.client.tsx` | `search-filters.client.tsx` | Explicit client component (optional) |

---

## 9. Review Checklist

For any PR adding components:

- [ ] Default to Server Component
- [ ] `"use client"` justified by specific use case
- [ ] Component placed in correct domain folder
- [ ] UI primitives used (not re-implemented)
- [ ] No cross-domain imports
- [ ] Props typed via shared contracts

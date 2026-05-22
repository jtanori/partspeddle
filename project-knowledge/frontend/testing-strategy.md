# VINTRACK — Frontend Testing Strategy

> **Status:** Canonical Governance Document
> **Scope:** Unit, component, integration, and E2E tests for frontend code
> **Effective:** 2026-05-19

---

## 1. Purpose

Ensure frontend reliability using the same testing discipline as backend: deterministic, fast, and comprehensive.

---

## 2. Test Pyramid

| Layer | Tool | Location | Scope |
|-------|------|----------|-------|
| Unit | Vitest | `src/frontend/lib/**/*.test.ts` | Pure functions, utilities |
| Component | Vitest + RTL | `src/frontend/components/**/*.test.tsx` | Component rendering, interactions |
| Integration | Vitest + MSW | `tests/integration/frontend/` | API + component integration |
| E2E | Playwright | `tests/e2e/frontend/` | Critical user journeys |

---

## 3. Unit Tests

### 3.1 Scope

Pure functions, utilities, hooks (without browser APIs):

```typescript
// src/frontend/lib/format-price.test.ts
import { describe, it, expect } from 'vitest';
import { formatPrice } from './format-price';

describe('formatPrice', () => {
  it('formats USD correctly', () => {
    expect(formatPrice(1000, 'USD')).toBe('$1,000.00');
  });

  it('handles cents', () => {
    expect(formatPrice(99.99, 'USD')).toBe('$99.99');
  });
});
```

---

## 4. Component Tests

### 4.1 React Testing Library

```tsx
// src/frontend/components/marketplace/listing-card.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListingCard } from './listing-card';

describe('ListingCard', () => {
  const listing = {
    id: '1',
    title: 'Vintage Watch',
    price: 500,
    imageUrl: '/watch.jpg',
  };

  it('renders listing title', () => {
    render(<ListingCard listing={listing} />);
    expect(screen.getByText('Vintage Watch')).toBeInTheDocument();
  });

  it('renders formatted price', () => {
    render(<ListingCard listing={listing} />);
    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });
});
```

### 4.2 Mocking API Calls

Use Mock Service Worker (MSW) for API mocking:

```typescript
// tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/v1/marketplace/listings/featured', () => {
    return HttpResponse.json([
      { id: '1', title: 'Item 1', price: 100 },
    ]);
  }),
];
```

---

## 5. E2E Tests

### 5.1 Playwright

```typescript
// tests/e2e/frontend/homepage.spec.ts
import { test, expect } from '@playwright/test';

test('homepage loads with listings', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Featured Listings')).toBeVisible();
  await expect(page.getByTestId('listing-card')).toHaveCount.greaterThan(0);
});

test('auth flow works', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
});
```

### 5.2 Critical Journeys

| Journey | Test File |
|---------|----------|
| Homepage → View Listing | `homepage-to-listing.spec.ts` |
| Search → Filter → View | `search-journey.spec.ts` |
| Login → Browse → Logout | `auth-journey.spec.ts` |
| Seller Onboarding | `seller-onboarding.spec.ts` |

---

## 6. Test Configuration

### 6.1 Vitest Config

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup-frontend.ts'],
  },
});
```

### 6.2 Frontend Setup

```typescript
// tests/setup-frontend.ts
import '@testing-library/jest-dom/vitest';
import { server } from './mocks/server';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

---

## 7. Coverage

| Layer | Target | Threshold |
|-------|--------|-----------|
| Unit + Component | 80% | Lines |
| E2E | Critical journeys only | All must pass |

---

## 8. Anti-Patterns

| Anti-Pattern | Why Forbidden |
|-------------|--------------|
| Testing implementation details | Tests break on refactoring |
| `getById` queries | Not user-centric |
| Real API calls in tests | Flaky, slow, stateful |
| E2E tests for edge cases | Too slow; use component tests |
| Missing `data-testid` | Hard to target elements |

---

## 9. Review Checklist

For any PR adding frontend code:

- [ ] Unit tests for pure functions
- [ ] Component tests for UI components
- [ ] MSW mocks for API calls
- [ ] E2E tests for critical journeys (if applicable)
- [ ] `data-testid` added for test targets
- [ ] All tests pass in CI

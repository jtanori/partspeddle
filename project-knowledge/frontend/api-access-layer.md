# VINTRACK — Frontend API Access Layer

> **Status:** Canonical Governance Document
> **Scope:** All backend communication from frontend code
> **Effective:** 2026-05-19

---

## 1. Purpose

Prevent random `fetch()` proliferation. Every backend call flows through a typed, instrumented, governed API access layer.

---

## 2. Doctrine

**Random `fetch()` calls from components are FORBIDDEN.**

All backend communication flows through `src/frontend/lib/api/`.

---

## 3. Directory Structure

```
src/frontend/lib/api/
  client.ts         # Base HTTP client with interceptors
  identity.ts       # Identity domain endpoints
  marketplace.ts    # Marketplace domain endpoints
  search.ts         # Search domain endpoints
  errors.ts         # Error normalization
  index.ts          # Public exports
```

---

## 4. Base Client

```typescript
// src/frontend/lib/api/client.ts
import { sharedContracts } from '@/shared/contracts';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiClient {
  private async request<T>(
    method: string,
    path: string,
    options?: RequestInit,
  ): Promise<T> {
    const session = await this.getSession();
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': crypto.randomUUID(),
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw await this.normalizeError(response);
    }

    return response.json();
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, { body: JSON.stringify(body) });
  }

  // Retry: idempotent GETs retry 3x with exponential backoff
  async getWithRetry<T>(path: string, maxRetries = 3): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.get<T>(path);
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
      }
    }
    throw new Error('Unreachable');
  }

  private async normalizeError(response: Response): Promise<Error> {
    const body = await response.json().catch(() => ({}));
    return new Error(body.error?.message ?? `HTTP ${response.status}`);
  }

  private async getSession() {
    // Implementation depends on @supabase/ssr
    // Browser vs RSC have different session access patterns
    return null;
  }
}

export const api = new ApiClient();
```

---

## 5. Domain API Wrappers

```typescript
// src/frontend/lib/api/identity.ts
import { api } from './client.js';
import type { User, Profile } from '@/shared/contracts';

export const identityApi = {
  async getCurrentUser(): Promise<User> {
    return api.get<User>('/v1/identity/users/me');
  },

  async updateProfile(data: Partial<Profile>): Promise<Profile> {
    return api.post<Profile>('/v1/identity/profiles/me', data);
  },

  async registerSeller(): Promise<void> {
    return api.post('/v1/identity/sellers/register', {});
  },
};
```

```typescript
// src/frontend/lib/api/marketplace.ts
import { api } from './client.js';
import type { Listing } from '@/shared/contracts';

export const marketplaceApi = {
  async getFeaturedListings(): Promise<Listing[]> {
    return api.getWithRetry<Listing[]>('/v1/marketplace/listings/featured');
  },

  async getListing(id: string): Promise<Listing> {
    return api.get<Listing>(`/v1/marketplace/listings/${id}`);
  },
};
```

---

## 6. Error Normalization

Backend `DomainError` codes map to frontend-friendly errors:

```typescript
// src/frontend/lib/api/errors.ts
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public retryable: boolean,
  ) {
    super(message);
  }
}

const ERROR_MAP: Record<string, string> = {
  IDENTITY_USER_NOT_FOUND: 'User not found. Please sign in again.',
  IDENTITY_SELLER_ALREADY_EXISTS: 'You already have a seller profile.',
  MARKETPLACE_LISTING_NOT_FOUND: 'This listing is no longer available.',
};

export function normalizeError(code: string, message: string): string {
  return ERROR_MAP[code] ?? message;
}
```

---

## 7. Timeout Policy

| Operation Type | Default Timeout | Configurable |
|---------------|----------------|--------------|
| GET (idempotent) | 10s | Yes |
| POST/PUT/PATCH | 30s | Yes |
| DELETE | 10s | Yes |
| File upload | 60s | Yes |

---

## 8. Retry Policy

| Method | Retryable | Max Retries | Backoff |
|--------|-----------|-------------|---------|
| GET | Yes (idempotent) | 3 | Exponential: 1s, 2s, 4s |
| POST | No (non-idempotent) | 0 | — |
| PUT | Yes (idempotent) | 3 | Exponential |
| PATCH | No | 0 | — |
| DELETE | Yes | 3 | Exponential |

**Exception:** If backend returns `Retry-After` header, use that value.

---

## 9. Anti-Patterns

| Anti-Pattern | Why Forbidden |
|-------------|--------------|
| `fetch('/v1/...')` in components | No typing, no auth injection, no error normalization |
| `fetch` without timeout | Hanging requests degrade UX |
| `fetch` without error handling | Raw errors leak to UI |
| Business logic in API wrappers | Wrappers are transport only; logic belongs in hooks/services |
| Calling Supabase DB directly | Violates domain governance |

---

## 10. Usage in Components

```typescript
// CORRECT
import { marketplaceApi } from '@/frontend/lib/api/marketplace';

export default async function HomePage() {
  const listings = await marketplaceApi.getFeaturedListings();
  return <ListingGrid listings={listings} />;
}

// FORBIDDEN
export default async function HomePage() {
  const listings = await fetch('/v1/marketplace/listings/featured');
  return <ListingGrid listings={listings} />;
}
```

---

## 11. Review Checklist

For any PR calling backend APIs:

- [ ] All calls flow through `src/frontend/lib/api/`
- [ ] No raw `fetch()` in components
- [ ] Auth token injected automatically
- [ ] Errors normalized for UI display
- [ ] Timeouts configured appropriately
- [ ] Retry policy matches idempotency

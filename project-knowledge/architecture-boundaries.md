# VINTRACK — Architecture Boundaries

> **Status:** Canonical governance  
> **Scope:** All domains, infrastructure adapters, and cross-cutting concerns  
> **Effective:** 2026-05-19

---

## 1. Purpose

Prevent architectural drift by formally defining which code may depend on which.

Boundaries exist to:

- Keep the domain layer vendor-independent
- Prevent framework semantics from leaking upward
- Make infrastructure replaceable without domain rewrites
- Enable deterministic testing without external services

---

## 2. Dependency Direction

```
Domain Layer
  ↑ depends on
Application Layer (ports)
  ↑ depends on
Infrastructure Layer (adapters)
  ↑ depends on
External Vendors / Frameworks
```

**No downward dependencies.** Domain code must never import infrastructure or vendor code.

---

## 3. Forbidden Imports

### 3.1 `@supabase/supabase-js`

**Rule:** NO DOMAIN CODE MAY IMPORT `@supabase/supabase-js`.

**Allowed locations ONLY:**

- `src/identity/infrastructure/auth/*`
- `src/shared/supabase/*`
- Migration and seed scripts
- Operational CLI tooling

**Rationale:**

Supabase Auth is a replaceable infrastructure concern. If the domain depends on Supabase SDK types or semantics, provider replacement becomes a full-domain rewrite.

**Enforcement:**

- ESLint rule: `no-restricted-imports` for `@supabase/supabase-js` outside allowed paths
- CI check: `npm run lint` fails on violation
- Code review: Any PR introducing `@supabase/supabase-js` in `src/*/domain/` or `src/*/application/` is blocked

**Violation response:**

1. Revert the offending import
2. Introduce a port/interface in `application/ports/`
3. Move the implementation to `infrastructure/`
4. Add a regression test

---

## 4. Port/Adapter Pattern

Every external dependency MUST be accessed through a port (interface) defined in the application layer.

| Concern | Port Location | Adapter Location |
|---------|--------------|------------------|
| Authentication | `identity/application/ports/identity-provider.ts` | `identity/infrastructure/auth/supabase-auth-provider.ts` |
| Persistence | Domain repository interface | `identity/infrastructure/persistence/*` |
| Event bus | `shared/ports/event-publisher.ts` | `shared/infrastructure/event-bus/*` |
| Queue | `shared/ports/job-queue.ts` | `shared/infrastructure/queue/*` |

---

## 5. Type Safety Boundaries

### 5.1 No Vendor Types in Domain

Vendor-specific types (Supabase `User`, Prisma models, etc.) MUST be mapped to domain types at the adapter boundary.

```typescript
// BAD: Supabase User leaks into domain
function createUser(supabaseUser: SupabaseUser): User { ... }

// GOOD: Adapter maps to domain shape
function createUser(dto: IdentityProviderUserDto): User { ... }
```

### 5.2 AsyncLocalStorage for Context

Request-scoped context (auth, correlation ID, traceparent) flows through `AsyncLocalStorage`, not global variables or implicit parameters.

---

## 6. Testing Boundaries

| Layer | Test Strategy | External Services |
|-------|--------------|-------------------|
| Domain | Pure unit tests | None |
| Application | Unit tests with mocked ports | None |
| Infrastructure | Contract tests against real vendor | Yes (test containers) |
| API | Integration tests with full stack | Yes (test DB + Redis) |

---

## 7. Future Boundaries

As VINTRACK grows, these boundaries will be formalized:

- **Message queue semantics** — BullMQ types isolated to `infrastructure/queue/`
- **Payment provider types** — Stripe types isolated to `transactions/infrastructure/`
- **Search engine types** — Meilisearch/Typesense types isolated to `search/infrastructure/`
- **Email provider types** — Resend/SendGrid types isolated to `notifications/infrastructure/`

---

## 8. Governance Summary

- Domain code owns business semantics
- Infrastructure code owns vendor integration
- Ports are the ONLY contract between them
- Vendor types die at the adapter boundary
- Tests verify boundaries, not just behavior

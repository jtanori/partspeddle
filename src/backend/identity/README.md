# Identity Bounded Context

> **Domain:** Identity  
> **Milestone:** M2 — Identity Foundation  
> **Owner:** VINTRACK

---

## Purpose

Manages user identity, authentication context, profile lifecycle, and seller onboarding within VINTRACK.

This bounded context is **vendor-independent**. Supabase Auth is one possible identity provider; the domain layer has no dependency on `@supabase/supabase-js`.

---

## Architecture

```
┌─────────────────────────────────────────┐
│  API Layer (routes, middleware, DTOs)   │
├─────────────────────────────────────────┤
│  Application Layer (ports, services)    │
├─────────────────────────────────────────┤
│  Domain Layer (entities, events, rules) │
├─────────────────────────────────────────┤
│  Infrastructure (adapters, repositories)│
└─────────────────────────────────────────┘
```

---

## Entities

| Entity | Responsibility | File |
|--------|---------------|------|
| `User` | Aggregate root. Status transitions, email invariant, event emission. | `domain/entities/user.ts` |
| `Profile` | Public user-facing data. Display name, avatar. | `domain/entities/profile.ts` |
| `BuyerProfile` | Minimal buyer metadata. Lazy-created. | `domain/entities/buyer-profile.ts` |
| `SellerProfile` | Seller lifecycle + onboarding state machine. | *(T2.3)* |

---

## Events

| Event | Emitted By | Consumers |
|-------|-----------|-----------|
| `identity.user_created` | `User` | Search, Notifications |
| `identity.user_suspended` | `User` | Session revocation, Search |
| `identity.user_reactivated` | `User` | Search |
| `identity.seller_activated` | `SellerProfile` | Marketplace, Search |

---

## Auth Model

VINTRACK owns `identity.users` as the system-of-record.

```
JWT arrives
  ↓
IdentityProvider.verifyToken(jwt)
  ↓
Lazy provision identity.users (if missing)
  ↓
Attach AuthContext to request
  ↓
Repositories scope queries by user_id
```

**Primary provisioning:** Lazy, on first authenticated request.  
**Reconciliation:** Supabase Auth webhooks (eventual consistency).  
**RLS:** Deny-all fallback only. Application middleware is primary authorization.

See `project-knowledge/adr/002-auth-provider-decoupling.md` for full rationale.

---

## Directory Map

```
src/identity/
├── api/
│   ├── middleware/        # Auth middleware, validation
│   ├── routes/            # Express routes
│   └── dto/               # Request/response DTOs
├── application/
│   ├── ports/             # IdentityProvider, AuthContext
│   └── services/          # Lazy provisioning, onboarding
├── domain/
│   ├── entities/          # User, Profile, BuyerProfile, SellerProfile
│   ├── events/            # Domain event factories + schemas
│   └── services/          # State machines, domain services
└── infrastructure/
    ├── auth/              # SupabaseAuthProvider adapter
    ├── persistence/       # PostgreSQL repositories
    └── webhooks/          # Supabase webhook handlers
```

---

## Testing

```bash
# Domain unit tests
npm run test:unit -- src/identity/domain/entities

# Integration tests (requires Postgres + Redis)
npm run test:integration -- tests/integration/identity
```

---

## Governance

- **No `@supabase/supabase-js` imports** in `domain/` or `application/`.
- **All auth failures** map to domain errors, not SDK errors.
- **Status transitions** are enforced by the aggregate, not the database.

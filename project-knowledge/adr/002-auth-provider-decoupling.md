# ADR-002: Auth Provider Decoupling

| Field | Value |
|-------|-------|
| Status | Approved |
| Date | 2026-05-19 |
| Author | Agent 1 |
| Deciders | Product Owner |

## Context

VINTRACK initially assumed a full local Supabase stack (PostgreSQL + Auth + Studio + Kong + ...). During M2 — Identity Foundation implementation, an architectural review revealed that:

1. The local Supabase stack is memory-intensive (~2–4GB), slow to start, and operationally fragile.
2. VINTRACK only needs PostgreSQL (persistence) and JWT auth (identity verification).
3. The remaining Supabase services (Realtime, Storage, Edge Functions, Studio, etc.) are unused.
4. The architecture already decouples domain logic from infrastructure (repositories, outbox, queues).

## Decision

Adopt a **hosted auth + local infrastructure** model:

- **Local:** PostgreSQL + Redis only
- **Hosted:** Supabase Auth (cloud) for JWT issuance, OAuth, email auth
- **Identity ownership:** VINTRACK owns `identity.users` as the system-of-record
- **Auth abstraction:** `IdentityProvider` port hides Supabase SDK from domain code

## Consequences

### Positive

- **Faster local startup:** ~5–10s instead of minutes
- **Lower resource usage:** ~200–400MB RAM instead of 2–4GB
- **Auth provider replaceability:** Can migrate to Clerk, Auth.js, or Keycloak without domain changes
- **Simpler CI:** Same postgres + redis services, no Supabase orchestration
- **Cleaner boundaries:** Identity domain owns user lifecycle, not external vendor

### Negative

- **Offline development impossible:** Requires internet for auth verification
- **Eventual consistency window:** JWT may be valid before `identity.users` row exists
- **Additional abstraction layer:** `IdentityProvider` port adds indirection

### Mitigations

- **Lazy provisioning:** First authenticated request creates `identity.users` row atomically
- **Webhook reconciliation:** Hosted Supabase Auth webhooks sync lifecycle events
- **Idempotency:** Redis-backed deduplication for webhooks

## Schema Impact

### Before
```sql
-- FK to Supabase-managed table
CREATE TABLE identity.profiles (
  user_id UUID REFERENCES auth.users(id)
);
```

### After
```sql
-- VINTRACK owns the user table
CREATE TABLE identity.users (
  id UUID PRIMARY KEY,  -- Supabase user UUID (initially)
  auth_provider TEXT NOT NULL DEFAULT 'supabase',
  email TEXT NOT NULL,
  status identity.user_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE identity.profiles (
  user_id UUID REFERENCES identity.users(id)
);
```

## Security Model

### Before
Postgres RLS policies using `auth.uid()` for row-level enforcement.

### After
Service backend owns authorization:
```
JWT
  ↓
API middleware (IdentityProvider.verifyToken)
  ↓
Lazy provision identity.users
  ↓
Attach auth context to request
  ↓
Repositories scope queries by user_id
```

Postgres RLS is kept minimal (deny-all fallback) but is NOT the primary authorization mechanism.

## Migration Path

| Phase | Tickets | Work |
|-------|---------|------|
| 1 | T2.0A, T1.5A, T2.1A | ADR, infra simplification, schema migration |
| 2 | T2.2, T2.2A, T2.2B | Domain aggregates, auth provider port, middleware |
| 3 | T2.3, T2.4 | Seller state machine, repositories |
| 4 | T2.5, T2.6A, T2.6B, T2.7, T2.8 | API routes, webhook sync, workers, integration tests |

## Related Decisions

- ADR-001 (if exists): Database Governance
- /project-knowledge/database-governance.md
- /project-knowledge/event-envelope-standard.md

## References

- Supabase Auth webhooks: https://supabase.com/docs/guides/auth/webhooks
- JWT verification via JWKS: https://supabase.com/docs/guides/auth/jwks

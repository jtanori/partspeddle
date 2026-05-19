# VINTRACK — Service Role Governance

## Purpose

The Supabase **service role key** bypasses Row Level Security (RLS). It is effectively root access to the database. This document defines where it is allowed, where it is forbidden, and how its use is observed.

---

## Role Definitions

| Role | Key | RLS Behavior | Use Case |
|------|-----|-------------|----------|
| `anon` | Anon key | **Respects** RLS | Client-facing APIs, user-derived requests |
| `service` | Service role key | **Bypasses** RLS | Workers, migrations, internal orchestration |

---

## Allowed Contexts for Service Role

Service role is **ONLY** permitted in:

- **Background workers** — BullMQ workers processing async jobs
- **Migrations** — Database schema migrations and seed scripts
- **Internal orchestration** — Outbox relay, reconciliation, scheduled jobs
- **Operational tooling** — Admin CLI, one-off scripts, manual fixes

## Forbidden Contexts for Service Role

Service role is **NEVER** permitted in:

- **Request-scoped APIs** — Express routes handling HTTP requests
- **Frontend-exposed contexts** — Any code reachable from the browser
- **User-derived authorization paths** — Any logic that uses a user JWT to make decisions
- **Webhooks** — External webhook handlers must use user-scoped or anon clients

---

## Enforcement

### Code-Level

Use `createSupabaseClient(role)` factory exclusively. Direct `createClient(url, serviceKey)` instantiation is prohibited.

### Review-Level

Any PR containing `SUPABASE_SERVICE_KEY` outside of:
- `src/shared/supabase/client.ts`
- `src/shared/supabase/env.ts`
- Migration files
- Worker files

must be flagged for security review.

---

## Observability

All service-role operations **MUST** be observable:

- **Correlation ID** — Every operation carries a `correlationId`
- **Audit logging** — Service-role mutations logged at `info` level minimum
- **Metrics** — `db_service_role_queries_total` counter per domain

---

## Shutdown Lifecycle

Correct shutdown order prevents abandoned transactions and partial event processing:

1. Stop accepting HTTP requests
2. Stop queue polling (BullMQ workers)
3. Drain active workers to completion
4. Flush telemetry / logs
5. Close PostgreSQL pool (`closePool()`)
6. Close Redis connection (`closeRedisConnection()`)
7. Exit process

---

## Pool Ownership

| Resource | Ownership | Lifecycle |
|----------|-----------|-----------|
| PostgreSQL pool | Shared singleton | Process lifetime |
| Redis connection | Shared singleton | Process lifetime |
| Supabase service client | Singleton per role | Process lifetime |
| Supabase anon client | Singleton per role | Process lifetime |

No domain may create its own pool or connection. All persistence access goes through shared primitives.

---

## Future: JWT-Propagated User Client

Before M2 API routes and M3 seller ownership, introduce:

```typescript
createSupabaseUserClient(jwt: string)
```

This client:
- Authenticates as the specific user
- Respects RLS policies for that user
- Is request-scoped (not singleton)
- Required for all user-derived API endpoints

---

## Violation Response

If service role is discovered in a forbidden context:

1. Revert the offending code
2. Audit what data was accessed
3. Document the incident
4. Update CI checks to prevent recurrence

# VINTRACK — Database Governance

## Purpose

Defines schema conventions, migration philosophy, and operational rules for Supabase Postgres. The database is the system of record for all persistent state.

---

## Platform

- **Supabase Postgres** (managed)
- **Auth** via `auth.users` (Supabase native)
- **RLS** mandatory on all application tables
- **Realtime** for messaging and notifications only
- **Storage** for media assets

---

## Naming Conventions

| Layer | Convention | Example |
|-------|-----------|---------|
| Tables | `snake_case_plural` | `seller_profiles` |
| Columns | `snake_case` | `stripe_connect_account_id` |
| Primary keys | `id` (UUID) | `id UUID PRIMARY KEY` |
| Foreign keys | `<table>_id` | `user_id UUID REFERENCES users(id)` |
| Timestamps | `created_at`, `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` |
| Enums | `domain_concept` | `seller_status` |
| Indexes | `idx_<table>_<column>` | `idx_seller_profiles_status` |
| Constraints | `<table>_<column>_<type>` | `seller_profiles_sales_nonnegative` |

---

## Schema Rules

### Primary Keys

- Use `UUID` (gen_random_uuid()) for all application tables
- Exception: `auth.users` uses Supabase-managed UUID
- Never use auto-increment integers for business entities

### Timestamps

- All tables must have `created_at` and `updated_at`
- Use `TIMESTAMPTZ`, not `TIMESTAMP`
- `updated_at` auto-updated via trigger

```sql
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Soft Deletes

- No `DELETE` on business tables
- Use `status` enum with `deactivated` or `archived`
- Exception: `user_sessions` purged after 90 days (retention policy)

### JSONB Usage

- Allowed for: flexible metadata, preferences, addresses
- Forbidden for: relational data, searchable fields, aggregations
- JSONB fields must have JSON Schema validation at application layer

---

## Enum Policy

Use Postgres `CREATE TYPE` for bounded sets:

```sql
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deactivated');
CREATE TYPE seller_status AS ENUM ('pending', 'onboarding', 'review', 'active', 'suspended');
```

### Rules

- Enum values in `lowercase_snake_case`
- Adding values: safe backward-compatible operation
- Removing values: requires migration + data fix
- MVP rule: prefer enums over lookup tables for < 10 values

---

## Row-Level Security (RLS)

### Mandatory Policy Set

Every table must have:

1. **Self policy** — user can access own data
2. **Public policy** — if data is publicly readable
3. **Admin policy** — role-based override

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_self_all ON profiles
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY profiles_public_select ON profiles
    FOR SELECT USING (TRUE);
```

### Service Role

- Queue workers, event emitters, and webhook handlers use service role
- Service role bypasses RLS
- No client-side code uses service role key

---

## Index Discipline

### Required Indexes

- Primary key (implicit)
- All foreign keys (implicit in Supabase, but verify)
- All `UNIQUE` constraints (implicit)
- Columns used in `WHERE`, `JOIN`, `ORDER BY`

### Partial Indexes

Use for status filtering where one value dominates:

```sql
CREATE INDEX idx_users_status ON users(status) WHERE status != 'active';
```

### Index Limits

- Max 5 indexes per table for MVP
- No indexes on JSONB fields (use computed columns if needed)
- Document every index purpose in schema comments

---

## Migration Philosophy

### Tooling

- **Supabase CLI** for migrations: `supabase migration new <name>`
- **No ORM migrations** — raw SQL only
- Migrations are immutable after deployment to shared environments

### Naming

```
YYYYMMDDHHMMSS_descriptive_name.sql
```

Examples:
- `20260115103000_create_identity_tables.sql`
- `20260115120000_add_seller_profile_status_index.sql`

### Rules

1. One logical change per migration file
2. Migrations must be backward-compatible with running code
3. Never modify a deployed migration — create a new one
4. All migrations must run successfully in a transaction
5. Seed data in separate seed files, not migrations

### Rollback Strategy

- Forward-only migrations
- Rollback via compensating migration (new file)
- For destructive changes: copy data to backup table first

---

## Trigger Policy

### Allowed Triggers

- `updated_at` auto-timestamp
- Outbox insertion on state change
- Auth user sync (`handle_new_user`)
- Onboarding completion cascade

### Forbidden Triggers

- Business logic (belongs in application layer)
- Cross-domain mutations (use events instead)
- External API calls (use queues instead)

---

## Connection Management

### Pool Configuration

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

### Query Timeouts

- All queries: 5-second timeout
- Slow query alert: > 1 second
- Cancel and log queries exceeding 10 seconds

---

## Table Ownership

Every table must declare:
- **Owning bounded context** — which domain exclusively mutates this table
- **Emitting events** — which domain events this table's mutations produce
- **Consuming workflows** — which downstream domains consume those events

No table may be mutated outside its owning domain.

## Backup & Recovery

- Supabase automated daily backups (managed)
- PITR (Point-in-Time Recovery) enabled for production
- Test restore procedure monthly
- No manual backup scripts for MVP

---

## Final Principle

The database schema is architecture, not implementation detail. Every table, index, and constraint must be intentional, documented, and governed. Schema drift is architectural drift.

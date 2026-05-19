# VINTRACK — Local Development

## Purpose

One-command local setup. New developers (and AI agents) must be productive in < 10 minutes.

---

## Prerequisites

- Node.js 24+ (see `.nvmrc`)
- Docker (for Postgres + Redis only)
- Git
- Hosted Supabase Auth project (cloud)

## Quick Start

```bash
# 1. Clone
git clone <repo> && cd vintrack

# 2. Install
npm install

# 3. Environment
cp .env.example .env
# Edit .env:
#   DATABASE_URL — local Postgres (already correct)
#   REDIS_URL — local Redis (already correct)
#   SUPABASE_AUTH_URL — your hosted Supabase project URL
#   SUPABASE_ANON_KEY — from Supabase dashboard
#   SUPABASE_SERVICE_KEY — from Supabase dashboard
#   SUPABASE_JWKS_URL — from Supabase dashboard

# 4. Start infrastructure
npm run infra:up
# Starts: Postgres, Redis via Docker Compose (~5-10s)

# 5. Run migrations
npx tsx scripts/setup-test-db.ts

# 6. Start dev server
npm run dev
```

## Architecture Note

VINTRACK uses **hosted Supabase Auth** + **local PostgreSQL** + **local Redis**.

You do NOT run Supabase locally. The full Supabase stack (Studio, Kong, Realtime, Storage, etc.) is unnecessary for VINTRACK development.

See ADR-002: `/project-knowledge/adr/002-auth-provider-decoupling.md`

## Available Commands

```bash
npm run dev              # Start API server with hot reload
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests (needs infra)
npm run test:ci          # Full suite with coverage
npm run lint             # ESLint + Prettier check
npm run lint:fix         # Auto-fix lint issues
npm run infra:up         # Start Docker services (postgres + redis)
npm run infra:down       # Stop Docker services
```

## Test Database

- Same Postgres instance, transactions isolate tests
- Migrations auto-applied via `scripts/setup-test-db.ts`
- Tables truncated between tests (see `tests/setup-integration.ts`)
- Redis flushed between test suites

## Ports

| Service | Port | Notes |
|---------|------|-------|
| API | 3000 | Express app |
| Postgres | 54322 | Local dev mapping |
| Redis | 6379 | Native port |

## Auth Development

### Creating Test Users

Since auth is hosted, create users via Supabase Dashboard or API:

```bash
# Using Supabase CLI (remote)
supabase projects list
supabase db dump --linked  # if needed
```

### JWT for Testing

For integration tests, generate a test JWT from your hosted Supabase project or use the test utilities in `src/identity/infrastructure/auth/__tests__/`.

## Troubleshooting

### "Cannot connect to Docker daemon"
Docker Desktop must be running. On macOS: `open -a Docker`

### "auth.users does not exist"
This is expected. VINTRACK owns `identity.users`. See ADR-002.

### "JWT verification fails"
Verify `SUPABASE_JWKS_URL` is correct and reachable. Check Supabase project settings.

---

## Final Principle

Local development must mirror production semantics without production complexity. If it takes longer than 10 minutes to get running, the setup is broken.

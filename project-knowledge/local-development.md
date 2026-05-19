# VINTRACK — Local Development

## Purpose

One-command local setup. New developers (and AI agents) must be productive in < 10 minutes.

---

## Prerequisites

- Node.js 20+
- Docker (for Postgres + Redis)
- Supabase CLI
- Git

## Quick Start

```bash
# 1. Clone
git clone <repo> && cd vintrack

# 2. Install
npm install

# 3. Environment
cp .env.example .env
# Edit .env with local Supabase credentials

# 4. Start infrastructure
npm run infra:up
# Starts: Postgres, Redis via Docker Compose

# 5. Start Supabase local
supabase start

# 6. Run migrations
supabase db reset

# 7. Seed data
npm run db:seed

# 8. Start dev server
npm run dev
```

## Available Commands

```bash
npm run dev              # Start API server with hot reload
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests (needs infra)
npm run test:ci          # Full suite with coverage
npm run lint             # ESLint + Prettier check
npm run lint:fix         # Auto-fix lint issues
npm run db:migrate       # Run pending migrations
npm run db:reset         # Reset DB and re-run migrations
npm run db:seed          # Seed test data
npm run infra:up         # Start Docker services
npm run infra:down       # Stop Docker services
```

## Test Database

- Separate database: `vintrack_test`
- Migrations auto-applied before test run
- Each test wrapped in transaction, rolled back after
- Purged between test suites

## Ports

| Service | Port |
|---------|------|
| API | 3000 |
| Postgres | 54322 |
| Redis | 6379 |
| Supabase Studio | 54323 |

---

## Final Principle

Local development must mirror production semantics without production complexity. If it takes longer than 10 minutes to get running, the setup is broken.

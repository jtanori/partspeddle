# VINTRACK — Repository Structure

## Purpose

Defines the canonical directory layout and module boundaries. Prevents architectural drift during implementation.

---

## Root Layout

```
vintrack/
├── project-knowledge/          # Architecture docs, governance, reference cards
│   ├── identity/
│   │   └── IDENTITY-REFERENCE.md
│   ├── transactions/
│   └── ...
├── blueprints/                 # Structured procedural blueprints per domain
│   ├── identity/
│   ├── marketplace/
│   ├── transactions/
│   └── ...
├── src/                        # Source code
│   ├── identity/
│   ├── marketplace/
│   ├── ai-intelligence/
│   ├── search/
│   ├── transactions/
│   ├── messaging/
│   ├── vault/
│   ├── notifications/
│   └── shared/
├── tests/                      # Cross-domain integration tests
├── supabase/                   # Migrations, functions, RLS policies
│   ├── migrations/
│   └── functions/
├── scripts/                    # Operational scripts (not business logic)
├── .env.example
├── tsconfig.json
├── package.json
└── AGENTS.md
```

---

## Domain Module Structure

Every bounded context follows this exact structure:

```
src/<domain>/
├── domain/                     # Entities, value objects, invariants, events
│   ├── entities/
│   ├── events/
│   └── errors/
├── application/                # Use cases, services, DTOs
│   ├── ports/
│   ├── services/
│   └── dto/
├── infrastructure/             # Repositories, queue workers, external adapters
│   ├── persistence/
│   ├── queue/
│   └── webhooks/
├── api/                        # Routes, controllers, validation
│   ├── routes/
│   ├── controllers/
│   └── middleware/
├── index.ts                    # Public exports
└── README.md                   # Domain-specific notes
```

### File Count Target

| Directory | Max Files (MVP) |
|-----------|-----------------|
| `domain/` | 15 |
| `application/` | 10 |
| `infrastructure/` | 12 |
| `api/` | 8 |

If a directory exceeds these counts, the domain is too large and must be split post-MVP.

---

## Shared Module

```
src/shared/
├── event-bus/                  # Domain event publication/subscription
├── outbox/                     # Transactional outbox pattern
├── queue/                      # BullMQ factory, job definitions
├── observability/              # Logger, metrics, tracing
├── supabase/                   # Client factory, connection pooling
├── validation/                 # Common zod schemas
└── errors/                     # Base error classes
```

**Rule:** `shared/` contains cross-cutting infrastructure only. No business logic. No domain events.

---

## Cross-Domain Rules

| Rule | Enforcement |
|------|-------------|
| No cross-domain imports | ESLint `no-restricted-imports` |
| No shared database tables | Each domain owns its tables exclusively |
| Communication via events only | `src/shared/event-bus/` |
| No direct service-to-service HTTP calls | Async via queues or events |

---

## Test Structure

```
tests/
├── integration/                # Cross-domain integration tests
├── e2e/                        # End-to-end critical journeys
└── fixtures/                   # Shared test data factories
```

Domain-specific unit tests live inside `src/<domain>/` alongside source:

```
src/identity/domain/entities/user.ts
src/identity/domain/entities/user.test.ts
```

---

## Package Conventions

- One `package.json` at root (monorepo-lite, not turborepo/nx for MVP)
- Shared devDependencies at root
- Domain modules import each other via relative paths within `src/`
- No private packages or workspaces for MVP

---

## Import Order

```typescript
// 1. External libraries
import { z } from 'zod';

// 2. Shared modules
import { logger } from '../../shared/observability/logger.js';

// 3. Same-domain modules
import { SellerProfile } from '../domain/entities/seller-profile.js';

// 4. Relative utilities
import { formatError } from './utils.js';
```

---

## Shared Module Restrictions

`shared/` may expose:
- infrastructure primitives
- observability
- validation
- transport abstractions

`shared/` may NOT expose:
- business workflows
- domain entities
- orchestration logic
- aggregate coordination

This prevents `shared/` from becoming the monolith.

## Final Principle

The directory structure is architecture. If files end up in the wrong folder, the architecture has failed. Enforce structure ruthlessly.

# VINTRACK — Implementation Standards

## Purpose

Locks coding conventions before implementation begins. Every agent that writes code for VINTRACK must follow these rules. No exceptions without architectural review.

---

## Language & Runtime

- **TypeScript 5.x**, strict mode mandatory (`strict: true` in tsconfig)
- **Node.js 20+** LTS
- ESM modules (`"type": "module"`)
- No `any` types without explicit `@ts-expect-error` justification
- No `// @ts-ignore`

---

## Naming Conventions

| Layer | Convention | Example |
|-------|-----------|---------|
| Files | `kebab-case.ts` | `seller-profile.ts` |
| Directories | `kebab-case` | `queue-workers/` |
| Classes | `PascalCase` | `SellerProfile` |
| Interfaces | `PascalCase` | `SellerProfileRepository` |
| Types | `PascalCase` | `SellerStatus` |
| Functions | `camelCase` | `activateSeller()` |
| Variables | `camelCase` | `sellerProfileId` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| Enums | `PascalCase` | `UserStatus` |
| Enum members | `SCREAMING_SNAKE_CASE` | `ACTIVE` |
| Database tables | `snake_case_plural` | `seller_profiles` |
| Database columns | `snake_case` | `stripe_connect_account_id` |
| Events | `domain.action` | `seller.activated` |
| Queues | `domain-purpose` | `transaction-orchestration` |

---

## Code Style

- **Formatter**: Prettier, default config
- **Linter**: ESLint with TypeScript strict rules
- **Max line length**: 100
- **Quotes**: single
- **Semicolons**: required
- **Trailing commas**: required (es5)
- **No console.log** in production code; use structured logger
- **No implicit returns** — every branch must be explicit

---

## Error Handling

### Structured Errors

All domain errors extend a base `DomainError`:

```typescript
class DomainError extends Error {
  readonly code: string;
  readonly correlationId: string;
  readonly isRetryable: boolean;

  constructor(code: string, message: string, correlationId: string, isRetryable = false) {
    super(message);
    this.code = code;
    this.correlationId = correlationId;
    this.isRetryable = isRetryable;
  }
}
```

### Error Codes

Format: `DOMAIN_SPECIFIC_REASON`

Examples:
- `IDENTITY_SELLER_NOT_FOUND`
- `MARKETPLACE_LISTING_INVALID_STATUS`
- `TRANSACTION_PAYMENT_FAILED`
- `VAULT_ESCROW_ALREADY_RELEASED`

### Never Throw Raw Errors

Raw `Error`, `TypeError`, or library errors must be caught and wrapped in domain errors before crossing service boundaries.

---

## Async Patterns

- Prefer `async/await` over raw promises
- Always `await` promises; no floating promises
- Use `Promise.all()` for parallel independent operations
- Never use `Promise.all()` for dependent/sequential operations
- Queue jobs for async workflows; never long-running synchronous chains

---

## Dependency Rules

### Allowed Dependencies

| From | Can Import |
|------|-----------|
| `api/` | `application/`, `shared/` |
| `application/` | `domain/`, `shared/` |
| `domain/` | `shared/` (only types/utility) |
| `infrastructure/` | `domain/`, `application/`, `shared/` |
| `shared/` | Nothing project-specific |

### Forbidden Dependencies

- `domain/` → `infrastructure/` (dependency inversion)
- `domain/` → `application/` (inner layer cannot know outer layer)
- `api/` → `domain/` directly (must go through application layer)
- Cross-domain imports (e.g., `marketplace/` importing `transactions/domain/`)
- Cross-domain communication ONLY via events

---

## Documentation

- JSDoc on all public APIs and domain methods
- `@param` and `@returns` required
- `@throws` for methods that emit domain errors
- No JSDoc needed for private helpers (leading `_`)

---

## Transaction Boundaries

Only application services may open transactional boundaries.

Domain entities must remain persistence-agnostic.

Repositories may not begin or commit transactions.

## Logging Rules

Never log:
- secrets
- auth tokens
- payment provider tokens
- raw webhook payloads containing PII
- full JWTs

Log correlation IDs, user IDs, and action types only.

## Environment & Configuration

- Use `zod` for environment variable validation at startup
- Fail fast on missing required env vars
- No `process.env` access outside config module
- Secrets never logged, never committed

---

## Final Principle

Code is written once and read hundreds of times. Clarity and consistency beat cleverness. If a pattern requires explanation, it is the wrong pattern.

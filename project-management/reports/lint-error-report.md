# Lint Error Report — VINTRACK

> Generated: 2026-05-19
> Status: Source files clean. Test files: **168 errors** across 14 files.

---

## 1. What Was Already Fixed

### Infrastructure Changes
- **Created `tsconfig.eslint.json`** — Extends main tsconfig, includes `src/**/*` + `tests/**/*`, sets `noEmit: true`. Resolves the `"parserOptions.project"` parsing errors on all `**/*.test.ts` files.
- **Updated `eslint.config.js`** —
  - Pointed parser to `./tsconfig.eslint.json`
  - Disabled `no-undef` for TypeScript files (TypeScript compiler handles this; eliminated ~30 false positives for `process`, `crypto`, `console`, `setInterval`, etc.)

### Source File Fixes (production code)
All **source file** lint errors have been resolved. Key fixes:
- `src/app.ts` — `Number(process.env.PORT) || 3000` instead of `||` on nullable string
- `src/identity/domain/entities/user.ts` — Removed unnecessary optional chain; removed inferrable type annotations
- `src/shared/api/middleware/error-handler.ts` — Fixed incorrect `as string` cast to `as string | undefined`
- `src/shared/errors/domain-error.ts` — Removed always-truthy `Error.captureStackTrace` guard
- `src/shared/outbox/outbox.ts` — Removed unnecessary optional chain on non-nullish metadata
- `src/shared/outbox/relay-worker.ts` — Added `: unknown` to catch variable; wrapped async event handler in `void (async () => {})()`
- `src/shared/queue/worker-factory.ts` — Cast `job.data` to `unknown` for runtime validation; removed unnecessary `?? 0` on non-nullable `attemptsMade`
- `src/shared/supabase/client.ts` — Used `??=` operator; restructured to avoid exhaustive-type narrowing false positive
- `src/shared/supabase/env.ts` — Avoided both `!` and `as string` by assigning to narrowed locals first

---

## 2. Remaining Errors: Breakdown by Rule

| Rule | Count | Files Affected | Nature |
|------|-------|----------------|--------|
| `@typescript-eslint/no-unsafe-assignment` | 24 | logger.test, queue-factory.test, schema.test, json-utils.test, setup-integration.ts | Assigning `JSON.parse()` results or untyped query results |
| `@typescript-eslint/no-unsafe-member-access` | 42 | logger.test, schema.test, json-utils.test, setup-integration.ts | Accessing properties on `any` / `unknown` / `error` typed values |
| `@typescript-eslint/no-unsafe-call` | 32 | json-utils.test, setup-integration.ts | Calling methods on `error` typed values (test helper pattern) |
| `@typescript-eslint/no-unsafe-argument` | 6 | queue-factory.test, schema.test | Passing `any` to strongly-typed parameters |
| `@typescript-eslint/no-unsafe-return` | 5 | schema.test, json-utils.test | Returning `any` from typed functions |
| `@typescript-eslint/unbound-method` | 8 | correlation-id.test, error-handler.test, worker-factory.test | `vi.spyOn(obj, 'method')` referencing methods |
| `@typescript-eslint/require-await` | 16 | outbox.test, relay-worker.test, pool.test, setup-test-db.test | Mock async methods with no `await` |
| `@typescript-eslint/no-unused-vars` | 8 | error-handler.test, event-schema.test, outbox.test, relay-worker.test, queue-factory.test, json-utils.test, setup-test-db.test | Unused imports / variables |
| `@typescript-eslint/no-empty-function` | 2 | error-handler.test, queue-factory.test | Empty arrow functions in test setup |
| `@typescript-eslint/ban-ts-comment` | 5 | queue-factory.test | `@ts-expect-error` without 10+ char description |
| `@typescript-eslint/no-unnecessary-condition` | 2 | setup-integration.ts | Optional chain on non-nullish Redis client |

**Total: 168 errors, 0 warnings, 0 source-file errors.**

---

## 3. Remaining Errors: File-by-File Detail

### `src/shared/api/middleware/__tests__/correlation-id.test.ts` (4)
- **Rule:** `unbound-method` ×4
- **Pattern:** `vi.spyOn(setTraceContext, 'generateTraceparent')` — referencing methods on objects for Vitest spies.

### `src/shared/api/middleware/__tests__/error-handler.test.ts` (9)
- `no-unused-vars` — `logs` variable never used
- `no-empty-function` — empty arrow function `() => {}` as mock middleware
- `unbound-method` ×2 — `vi.spyOn(logger, 'error')` / `vi.spyOn(mapToHttpResponse, ...)`
- `no-unsafe-assignment` ×2 — assigning from `vi.mocked(logger.error).mock.calls[0]`
- `no-unsafe-member-access` ×3 — accessing `.error` on mocked call arrays

### `src/shared/event-bus/__tests__/event-schema.test.ts` (1)
- `no-unused-vars` — destructured `_` never used in `const [_first, _second] = ...`

### `src/shared/observability/__tests__/logger.test.ts` (21)
- All `no-unsafe-assignment` / `no-unsafe-member-access`
- **Pattern:** `const parsed = JSON.parse(logs[0]);` then accessing `parsed.timestamp`, `parsed.level`, etc. `JSON.parse` returns `any`.

### `src/shared/outbox/__tests__/outbox.test.ts` (4)
- `no-unused-vars` — `OutboxEntry` import never used
- `require-await` ×3 — mock `insert`, `query`, `update` methods are `async` but contain no `await`

### `src/shared/outbox/__tests__/relay-worker.test.ts` (9)
- `no-unused-vars` — `vi` imported but never used
- `require-await` ×8 — mock outbox/publisher/DLQ methods are `async` with no `await`

### `src/shared/queue/__tests__/queue-factory.test.ts` (9)
- `no-unsafe-assignment` — mock queue assignment
- `ban-ts-comment` ×5 — `@ts-expect-error` missing descriptions
- `no-unsafe-argument` — passing `any` to typed function
- `no-empty-function` — empty mock function
- `no-unused-vars` — `Queue` imported but never used

### `src/shared/queue/__tests__/worker-factory.test.ts` (1)
- `unbound-method` — `vi.spyOn(worker, 'on')` or similar

### `src/shared/supabase/__tests__/pool.test.ts` (1)
- `require-await` — async arrow function with no `await`

### `tests/integration/identity/schema.test.ts` (18)
- **Pattern:** Raw SQL queries via `postgres` library return `any[]`. All accesses (`.id`, `.email`, `.status`, etc.) trigger `no-unsafe-*` rules.
- Also `no-unsafe-argument` when passing query result fields to `expect(...).toBe()`.

### `tests/scripts/json-utils.test.ts` (77)
- **Dominates the error count.** Uses `Ajv` validation where `ajv.compile()` returns a validate function typed as `error` (odd Ajv typing in strict mode).
- All calls to `validate(data)`, `validate.errors`, `errors.map()`, etc. trigger `no-unsafe-call`, `no-unsafe-member-access`, `no-unsafe-assignment`.
- Also unused imports (`rmdirSync`, `unlinkSync`, `backupJson`, `files`).

### `tests/scripts/setup-test-db.test.ts` (4)
- `no-unused-vars` — `vi`, `beforeEach`
- `require-await` ×2 — async arrow functions with no `await`

### `tests/setup-integration.ts` (7)
- `no-unsafe-assignment` — `const redis = getRedisConnection()` typed as `error`? (likely missing `@types/ioredis` resolution)
- `no-unsafe-call` / `no-unsafe-member-access` — calling `.flushdb()`, `.quit()` on `error`-typed redis
- `no-unnecessary-condition` ×2 — optional chain `redis?.flushdb()` where `redis` is non-nullish

---

## 4. Architectural Questions for Decision

### Q1: Should test files be governed by `strict-type-checked` rules?
The `no-unsafe-*` family (`no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-call`, `no-unsafe-argument`, `no-unsafe-return`) accounts for **~110 of 168 errors** (65%). These arise from standard test patterns:
- `JSON.parse()` returns `any`
- Raw SQL query results are untyped
- Mock objects and spy call arrays are `any`
- Some libraries (Ajv) have poor strict-mode types

**Options:**
1. **Keep strict everywhere** — Fix all 110 errors by adding explicit type annotations/casts to every test. High maintenance, verbose.
2. **Relax `no-unsafe-*` for tests only** — Add an ESLint override for `**/*.test.ts` and `tests/**/*.ts` disabling these 5 rules. Keeps production strict. Standard practice.
3. **Relax more rules for tests** — Also disable `unbound-method` (Vitest spy pattern) and `require-await` (mock async stubs). These are another 25 errors.

**Recommendation:** Option 2 or 3 with a scoped override block in `eslint.config.js`.

### Q2: How should `tests/scripts/json-utils.test.ts` be handled?
This single file has **77 errors**, nearly half the total. The root cause is Ajv's `compile()` return type being resolved as `error` in this TypeScript configuration. Fixing it may require:
- Adding `@types/ajv` or adjusting import style
- Wrapping every Ajv call in type guards
- Or simply disabling `no-unsafe-*` for this file specifically

### Q3: Should `tests/setup-integration.ts` use `getRedisConnection()` directly?
The Redis client is typed as `error` in that file, suggesting a type resolution issue with ioredis. Is this a types problem or an import problem?

---

## 5. Quick-Win Fixes (No Architectural Decision Needed)

If the architect approves relaxed test rules, the following are still worth fixing manually:

| File | Issue | Fix |
|------|-------|-----|
| `error-handler.test.ts` | `logs` unused | Remove variable |
| `error-handler.test.ts` | empty arrow function | Add `// noop` body or use `vi.fn()` |
| `event-schema.test.ts` | `_` unused | Rename to `_event` or remove destructuring |
| `outbox.test.ts` | `OutboxEntry` unused | Remove import |
| `relay-worker.test.ts` | `vi` unused | Remove import |
| `queue-factory.test.ts` | `Queue` unused | Remove import |
| `queue-factory.test.ts` | `@ts-expect-error` ×5 | Add descriptions |
| `queue-factory.test.ts` | empty function | Use `vi.fn()` |
| `json-utils.test.ts` | `rmdirSync`, `unlinkSync`, `backupJson`, `files` unused | Remove |
| `setup-test-db.test.ts` | `vi`, `beforeEach` unused | Remove imports |
| `setup-integration.ts` | `redis?.flushdb()` / `redis?.quit()` | Remove `?.` (client is non-nullish) |

---

## 6. Supabase Environment (Separate Topic)

The user also asked about Supabase environment setup instructions that appeared in the conversation. Those instructions were for a **Next.js frontend** (e.g. `NEXT_PUBLIC_SUPABASE_URL`, `@supabase/ssr`, shadcn/ui components). VINTRACK is a **backend API** (Express, no React/Next frontend). The correct Supabase env for this project is already defined in `src/shared/supabase/env.ts`:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
DATABASE_URL=
SUPABASE_ANON_KEY=       # optional fallback
```

No Next.js packages or shadcn components should be installed.

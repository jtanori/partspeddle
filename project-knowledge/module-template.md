# VINTRACK — Module Template

## Purpose

Canonical scaffold for every bounded context module. Copy this structure when creating a new domain.

---

## Directory Scaffold

```
src/<domain>/
├── domain/
│   ├── entities/
│   │   └── __tests__/
│   ├── events/
│   │   └── __tests__/
│   ├── errors/
│   └── index.ts
├── application/
│   ├── ports/
│   ├── services/
│   │   └── __tests__/
│   ├── dto/
│   └── index.ts
├── infrastructure/
│   ├── persistence/
│   │   └── __tests__/
│   ├── queue/
│   │   └── __tests__/
│   ├── webhooks/
│   └── index.ts
├── api/
│   ├── routes/
│   ├── controllers/
│   │   └── __tests__/
│   ├── middleware/
│   └── index.ts
├── index.ts
└── README.md
```

---

## File Templates

### `domain/entities/<entity>.ts`

> **Note:** Entities accumulate transient domain events during a single transactional boundary. This is NOT event sourcing. Persistent state remains authoritative in Postgres.

```typescript
import { DomainEvent } from '../../shared/event-bus/domain-event.js';
import { DomainError } from '../../shared/errors/domain-error.js';

export class ExampleEntity {
  readonly id: string;
  private _status: ExampleStatus;
  private _uncommittedEvents: DomainEvent[] = [];

  constructor(props: ExampleEntityProps) {
    this.id = props.id;
    this._status = props.status;
    this.validate();
  }

  get status(): ExampleStatus { return this._status; }
  get uncommittedEvents(): readonly DomainEvent[] { return this._uncommittedEvents; }

  transition(newStatus: ExampleStatus): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new DomainError(
        'EXAMPLE_INVALID_TRANSITION',
        `Cannot transition from ${this._status} to ${newStatus}`,
        crypto.randomUUID(),
        false
      );
    }
    this._status = newStatus;
    this._uncommittedEvents.push(new DomainEvent('example.transitioned', {
      aggregateId: this.id,
      from: this._status,
      to: newStatus,
    }));
  }

  private canTransitionTo(newStatus: ExampleStatus): boolean {
    // State machine logic
    return VALID_TRANSITIONS[this._status].includes(newStatus);
  }

  private validate(): void {
    // Invariant checks
  }
}
```

### `application/services/<use-case>.ts`

```typescript
import { Logger } from '../../shared/observability/logger.js';
import { UnitOfWork } from '../ports/unit-of-work.js';

export class ExampleUseCase {
  constructor(
    private readonly repository: ExampleRepository,
    private readonly eventBus: EventBus,
    private readonly logger: Logger,
  ) {}

  async execute(dto: ExampleDto, correlationId: string): Promise<ExampleResult> {
    this.logger.info('Executing example use case', { correlationId, dto });

    const entity = await this.repository.findById(dto.id);
    if (!entity) {
      throw new DomainError('EXAMPLE_NOT_FOUND', 'Entity not found', correlationId, false);
    }

    entity.transition(dto.newStatus);

    await this.repository.save(entity);
    await this.eventBus.publish(entity.uncommittedEvents, correlationId);
    entity.clearEvents();

    return { id: entity.id, status: entity.status };
  }
}
```

### `infrastructure/persistence/<repository>.ts`

```typescript
import { SupabaseClient } from '../../shared/supabase/client.js';
import { Outbox } from '../../shared/outbox/outbox.js';

export class ExampleRepositoryImpl implements ExampleRepository {
  constructor(
    private readonly db: SupabaseClient,
    private readonly outbox: Outbox,
  ) {}

  async findById(id: string): Promise<ExampleEntity | null> {
    const { data, error } = await this.db
      .from('example_table')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw mapDbError(error);
    if (!data) return null;
    return this.toEntity(data);
  }

  async save(entity: ExampleEntity): Promise<void> {
    const { error } = await this.db
      .from('example_table')
      .upsert(this.toRecord(entity));

    if (error) throw mapDbError(error);

    for (const event of entity.uncommittedEvents) {
      await this.outbox.insert(event);
    }
  }

  private toEntity(row: DbRow): ExampleEntity { /* ... */ }
  private toRecord(entity: ExampleEntity): DbRow { /* ... */ }
}
```

### `api/routes/<route>.ts`

```typescript
import { Router } from 'express';
import { validateRequest } from '../../shared/validation/validate-request.js';
import { ExampleController } from '../controllers/example-controller.js';
import { exampleSchema } from '../dto/example-schema.js';

export function exampleRoutes(controller: ExampleController): Router {
  const router = Router();

  router.post(
    '/examples',
    validateRequest(exampleSchema),
    (req, res, next) => controller.create(req, res).catch(next)
  );

  return router;
}
```

### Transport Abstraction Note

The examples below use Express for clarity. In actual implementation, prefer thin transport adapters that map HTTP requests to application DTOs, keeping controllers framework-agnostic.

### `api/controllers/<controller>.ts`

```typescript
import { Request, Response } from 'express';
import { ExampleUseCase } from '../../application/services/example-use-case.js';

export class ExampleController {
  constructor(private readonly useCase: ExampleUseCase) {}

  async create(req: Request, res: Response): Promise<void> {
    const correlationId = req.headers['x-correlation-id'] as string || crypto.randomUUID();
    const result = await this.useCase.execute(req.body, correlationId);
    res.status(201).json(result);
  }
}
```

---

## README.md Template

```markdown
# <Domain> Domain

## Purpose
One-line description.

## Boundaries
- Owns: table1, table2
- Emits: event1, event2
- Depends on: external-service

## Quick Start
```bash
# Run tests
npm run test:unit -- src/<domain>/
```

## Key Files
- `domain/entities/` — Core entities
- `application/services/` — Use cases
- `api/routes.ts` — Route definitions
```

---

## Wiring

### `src/<domain>/index.ts`

```typescript
export { ExampleEntity } from './domain/entities/example-entity.js';
export { ExampleUseCase } from './application/services/example-use-case.js';
export { exampleRoutes } from './api/routes/example-routes.js';
```

### `src/app.ts` (root wiring)

```typescript
import { exampleRoutes } from './identity/api/routes/example-routes.js';

app.use('/v1/identity/examples', exampleRoutes(controller));
```

---

## Final Principle

Every domain module is identical in structure. If it looks different, it is wrong.

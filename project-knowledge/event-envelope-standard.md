# VINTRACK — Event Envelope Standard

## Purpose

Defines the canonical domain event envelope. Every event emitted by any bounded context must conform to this structure. Events are the operational nervous system.

---

## Envelope Structure

```typescript
interface DomainEvent {
  eventId: string;           // UUIDv4 — unique per event instance
  eventType: string;         // domain.action format
  eventVersion: number;      // Integer, starts at 1
  occurredAt: string;        // ISO-8601 with milliseconds
  correlationId: string;     // UUID — traces distributed workflow
  causationId: string;       // UUID — event that triggered this event
  actorId: string;           // UUID of user, or "system"
  domain: string;            // Owning bounded context
  aggregateId: string;       // UUID of the affected aggregate
  payload: Record<string, unknown>; // Event-specific data
  metadata: {                // Optional operational context
    traceparent?: string;
    sourceIp?: string;
    clientVersion?: string;
  };
}
```

### JSON Schema

```json
{
  "type": "object",
  "required": ["eventId", "eventType", "eventVersion", "occurredAt", "correlationId", "actorId", "domain", "aggregateId", "payload"],
  "properties": {
    "eventId": { "type": "string", "format": "uuid" },
    "eventType": { "type": "string", "pattern": "^[a-z]+\\.[a-z_]+$" },
    "eventVersion": { "type": "integer", "minimum": 1 },
    "occurredAt": { "type": "string", "format": "date-time" },
    "correlationId": { "type": "string", "format": "uuid" },
    "causationId": { "type": "string", "format": "uuid" },
    "actorId": { "type": "string" },
    "domain": { "type": "string", "pattern": "^[a-z]+$" },
    "aggregateId": { "type": "string", "format": "uuid" },
    "payload": { "type": "object" },
    "metadata": { "type": "object" }
  }
}
```

---

## Field Rules

### eventType

Format: `domain.action`

- Must use ubiquitous language terms
- Past tense for state changes: `seller.activated`, not `seller.activate`
- No verbs in present tense, no future tense

Valid: `listing.published`, `payment.authorized`, `escrow.locked`
Invalid: `listing.publish`, `payment.authorize`, `escrow.lock`

### eventVersion

- Start at `1`
- Increment on breaking payload changes only
- Adding optional fields is NOT breaking
- Removing fields, changing types, renaming fields IS breaking

### correlationId

- Injected at API Gateway on first client request
- Propagated through: API → service → queue → event → webhook
- Same correlationId across entire distributed workflow
- If absent, generate new UUID at system boundary

### causationId

- ID of the event that directly caused this event
- For API-initiated actions: use the request's correlationId
- For event-triggered actions: use the triggering event's eventId
- Enables causal chain reconstruction

### actorId

- UUID of authenticated user who initiated the action
- Use `"system"` for automated processes (reconciliation, timeouts)
- Use `"anonymous"` only for unauthenticated webhooks with verified source

---

## Payload Guidelines

### Include

- Aggregate state AFTER the change (not full aggregate)
- IDs of related aggregates (not full objects)
- Timestamp of the change
- Reason/cause if state is failure or suspension

### Exclude

- Sensitive data (PII, card tokens, credentials)
- Large nested objects (embeddings, images, long text)
- Computed fields (aggregations, counts)
- Cross-domain state (reference by ID only)

### Example

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "seller.activated",
  "eventVersion": 1,
  "occurredAt": "2026-01-15T10:30:00.000Z",
  "correlationId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "causationId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "actorId": "system",
  "domain": "identity",
  "aggregateId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "payload": {
    "sellerProfileId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "userId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "activatedAt": "2026-01-15T10:30:00.000Z",
    "stripeConnectAccountId": "acct_1234567890"
  },
  "metadata": {
    "traceparent": "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"
  }
}
```

---

## Validation

### Producer Validation

Before emission, validate:
- All required fields present and correctly typed
- `eventType` matches owning domain
- `eventVersion` is registered in domain event catalog
- `payload` serializes to JSON < 32KB preferred, 64KB hard limit

### Consumer Validation

On receipt, validate:
- Envelope structure passes schema
- `eventVersion` is supported (reject unknown versions)
- `aggregateId` is valid UUID
- Deduplicate by `eventId` (24-hour window minimum)

---

## Event Catalog

Each domain maintains an event catalog in `src/<domain>/events/catalog.ts`:

```typescript
export const IdentityEvents = {
  'user.created': { version: 1, payloadSchema: UserCreatedSchema },
  'seller.activated': { version: 1, payloadSchema: SellerActivatedSchema },
} as const;
```

New events require catalog registration before deployment.

---

## Versioning Policy

| Change | Action |
|--------|--------|
| Add optional field | No version change |
| Add required field | Minor version + consumer update |
| Remove field | Major version + deprecation period |
| Rename field | Major version + backward compatibility shim |
| Change field type | Major version + migration |

MVP rule: No event versioning gymnastics. If breaking change needed, create new event type (e.g., `seller.activated.v2` → `seller.onboarding.completed`).

---

## Event Ordering

Event ordering is guaranteed **ONLY within a single aggregate stream**.

Cross-domain event ordering is **NOT guaranteed**.

Consumers must tolerate eventual consistency.

## Final Principle

Events are immutable operational facts. Once emitted, they are written in stone. Corrections happen via compensating events, not mutation.

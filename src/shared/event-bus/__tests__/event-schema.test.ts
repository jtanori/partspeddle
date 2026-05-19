import { describe, it, expect } from 'vitest';
import { domainEventSchema, PAYLOAD_SIZE_LIMIT } from '../event-schema.js';

describe('domainEventSchema', () => {
  const validEvent = {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    eventType: 'seller.activated',
    eventVersion: 1,
    schemaVersion: 1,
    occurredAt: '2026-01-15T10:30:00.000Z',
    correlationId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    causationId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    actorId: 'system',
    domain: 'identity',
    aggregateId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    payload: { sellerProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
    metadata: { traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01' },
  };

  it('validates a correct event envelope', () => {
    expect(() => domainEventSchema.parse(validEvent)).not.toThrow();
    const result = domainEventSchema.parse(validEvent);
    expect(result.eventType).toBe('seller.activated');
  });

  it('rejects missing required fields', () => {
    const { eventId: _, ...missingEventId } = validEvent;

    expect(() => domainEventSchema.parse(missingEventId)).toThrow();
  });

  it('rejects invalid eventType format', () => {
    expect(() => domainEventSchema.parse({ ...validEvent, eventType: 'sellerActivated' })).toThrow();
    expect(() => domainEventSchema.parse({ ...validEvent, eventType: 'Seller.Activated' })).toThrow();
    expect(() => domainEventSchema.parse({ ...validEvent, eventType: 'seller.activate' })).toThrow();
    expect(() => domainEventSchema.parse({ ...validEvent, eventType: 'payment.authorize' })).toThrow();
  });

  it('rejects invalid UUID fields', () => {
    expect(() =>
      domainEventSchema.parse({ ...validEvent, eventId: 'not-a-uuid' }),
    ).toThrow();
    expect(() =>
      domainEventSchema.parse({ ...validEvent, correlationId: 'bad-id' }),
    ).toThrow();
  });

  it('rejects eventVersion below 1', () => {
    expect(() => domainEventSchema.parse({ ...validEvent, eventVersion: 0 })).toThrow();
    expect(() => domainEventSchema.parse({ ...validEvent, eventVersion: -1 })).toThrow();
  });

  it('rejects non-integer eventVersion', () => {
    expect(() => domainEventSchema.parse({ ...validEvent, eventVersion: 1.5 })).toThrow();
  });

  it('rejects schemaVersion below 1', () => {
    expect(() => domainEventSchema.parse({ ...validEvent, schemaVersion: 0 })).toThrow();
    expect(() => domainEventSchema.parse({ ...validEvent, schemaVersion: -1 })).toThrow();
  });

  it('rejects non-integer schemaVersion', () => {
    expect(() => domainEventSchema.parse({ ...validEvent, schemaVersion: 1.5 })).toThrow();
  });

  it('accepts optional aggregateType', () => {
    expect(() =>
      domainEventSchema.parse({ ...validEvent, aggregateType: 'SellerProfile' }),
    ).not.toThrow();
  });

  it('accepts omitted aggregateType', () => {
    const noAggType = { ...validEvent };
    delete (noAggType as Record<string, unknown>).aggregateType;

    expect(() => domainEventSchema.parse(noAggType)).not.toThrow();
  });

  it('rejects invalid datetime', () => {
    expect(() =>
      domainEventSchema.parse({ ...validEvent, occurredAt: 'not-a-date' }),
    ).toThrow();
  });

  it('rejects payload exceeding size limit', () => {
    const oversized = { ...validEvent, payload: { data: 'x'.repeat(PAYLOAD_SIZE_LIMIT) } };

    expect(() => domainEventSchema.parse(oversized)).toThrow();
  });

  it('accepts empty metadata', () => {
    const noMeta = { ...validEvent };
    delete (noMeta as Record<string, unknown>).metadata;

    expect(() => domainEventSchema.parse(noMeta)).not.toThrow();
  });

  it('accepts valid optional metadata fields', () => {
    const withMeta = {
      ...validEvent,
      metadata: {
        traceparent: '00-abc123',
        sourceIp: '192.168.1.1',
        clientVersion: '1.0.0',
      },
    };

    expect(() => domainEventSchema.parse(withMeta)).not.toThrow();
  });
});

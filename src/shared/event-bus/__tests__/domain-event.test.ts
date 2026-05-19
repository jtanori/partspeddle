import { describe, it, expect } from 'vitest';
import { DomainError } from '../../errors/domain-error.js';
import { DomainEvent } from '../domain-event.js';

describe('DomainEvent', () => {
  const baseProps = {
    eventType: 'seller.activated',
    correlationId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    actorId: 'system',
    domain: 'identity',
    aggregateId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    payload: { sellerProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
  };

  it('creates a valid event with all required fields', () => {
    const event = new DomainEvent(baseProps);

    expect(event.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(event.eventType).toBe('seller.activated');
    expect(event.eventVersion).toBe(1);
    expect(event.correlationId).toBe(baseProps.correlationId);
    expect(event.causationId).toBe(baseProps.correlationId);
    expect(event.actorId).toBe('system');
    expect(event.domain).toBe('identity');
    expect(event.aggregateId).toBe(baseProps.aggregateId);
    expect(event.payload).toEqual(baseProps.payload);
    expect(event.occurredAt).toBeTruthy();
    expect(new Date(event.occurredAt).getTime()).not.toBeNaN();
    expect(event.metadata).toEqual({});
  });

  it('accepts optional eventId', () => {
    const eventId = '550e8400-e29b-41d4-a716-446655440000';
    const event = new DomainEvent({ ...baseProps, eventId });

    expect(event.eventId).toBe(eventId);
  });

  it('accepts optional eventVersion', () => {
    const event = new DomainEvent({ ...baseProps, eventVersion: 2 });

    expect(event.eventVersion).toBe(2);
  });

  it('accepts optional causationId', () => {
    const causationId = '550e8400-e29b-41d4-a716-446655440001';
    const event = new DomainEvent({ ...baseProps, causationId });

    expect(event.causationId).toBe(causationId);
  });

  it('accepts optional metadata', () => {
    const metadata = { traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01' };
    const event = new DomainEvent({ ...baseProps, metadata });

    expect(event.metadata).toEqual(metadata);
  });

  it('throws on invalid eventType format', () => {
    expect(() => new DomainEvent({ ...baseProps, eventType: 'sellerActivated' })).toThrow(
      DomainError,
    );
    expect(() => new DomainEvent({ ...baseProps, eventType: 'Seller.Activated' })).toThrow(
      DomainError,
    );
  });

  it('error includes correct code for invalid eventType', () => {
    try {
      new DomainEvent({ ...baseProps, eventType: 'sellerActivated' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('SHARED_EVENT_INVALID_TYPE');
    }
  });

  it('throws on invalid domain format', () => {
    expect(() => new DomainEvent({ ...baseProps, domain: 'Identity' })).toThrow(DomainError);
    expect(() => new DomainEvent({ ...baseProps, domain: 'identity-domain' })).toThrow(DomainError);
  });

  it('error includes correct code for invalid domain', () => {
    try {
      new DomainEvent({ ...baseProps, domain: 'Identity' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as DomainError).code).toBe('SHARED_EVENT_INVALID_DOMAIN');
    }
  });

  it('throws on empty payload', () => {
    expect(() => new DomainEvent({ ...baseProps, payload: {} })).toThrow(DomainError);
  });

  it('error includes correct code for empty payload', () => {
    try {
      new DomainEvent({ ...baseProps, payload: {} });
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as DomainError).code).toBe('SHARED_EVENT_PAYLOAD_EMPTY');
    }
  });

  it('throws on payload exceeding 64KB', () => {
    const largePayload = { data: 'x'.repeat(65 * 1024) };

    expect(() => new DomainEvent({ ...baseProps, payload: largePayload })).toThrow(DomainError);
  });

  it('error includes correct code for oversized payload', () => {
    try {
      new DomainEvent({ ...baseProps, payload: { data: 'x'.repeat(65 * 1024) } });
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as DomainError).code).toBe('SHARED_EVENT_PAYLOAD_TOO_LARGE');
    }
  });

  it('allows payload up to 64KB', () => {
    const payload = { data: 'x'.repeat(60 * 1024) };

    expect(() => new DomainEvent({ ...baseProps, payload })).not.toThrow();
  });

  it('serializes to JSON envelope', () => {
    const event = new DomainEvent(baseProps);
    const json = event.toJSON();

    expect(json).toHaveProperty('eventId');
    expect(json).toHaveProperty('eventType', 'seller.activated');
    expect(json).toHaveProperty('eventVersion', 1);
    expect(json).toHaveProperty('occurredAt');
    expect(json).toHaveProperty('correlationId');
    expect(json).toHaveProperty('causationId');
    expect(json).toHaveProperty('actorId');
    expect(json).toHaveProperty('domain');
    expect(json).toHaveProperty('aggregateId');
    expect(json).toHaveProperty('payload');
    expect(json).toHaveProperty('metadata');
  });
});

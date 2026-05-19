import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { DomainError } from '../../errors/domain-error.js';
import { EventCatalog } from '../event-catalog.js';

describe('EventCatalog', () => {
  let catalog: EventCatalog;

  const sellerActivatedSchema = z.object({
    sellerProfileId: z.string().uuid(),
    activatedAt: z.string().datetime(),
  });

  beforeEach(() => {
    catalog = new EventCatalog();
  });

  it('registers an event type', () => {
    catalog.register('seller.activated', { version: 1, payloadSchema: sellerActivatedSchema });

    expect(catalog.has('seller.activated')).toBe(true);
  });

  it('retrieves registered event entry', () => {
    catalog.register('seller.activated', { version: 1, payloadSchema: sellerActivatedSchema });

    const entry = catalog.get('seller.activated');
    expect(entry).toBeDefined();
    expect(entry?.version).toBe(1);
    expect(entry?.payloadSchema).toBe(sellerActivatedSchema);
  });

  it('returns undefined for unregistered events', () => {
    expect(catalog.get('unknown.event')).toBeUndefined();
    expect(catalog.has('unknown.event')).toBe(false);
  });

  it('throws on duplicate registration', () => {
    catalog.register('seller.activated', { version: 1, payloadSchema: sellerActivatedSchema });

    expect(() =>
      catalog.register('seller.activated', { version: 1, payloadSchema: sellerActivatedSchema }),
    ).toThrow(DomainError);
  });

  it('error includes correct code for duplicate registration', () => {
    catalog.register('seller.activated', { version: 1, payloadSchema: sellerActivatedSchema });

    try {
      catalog.register('seller.activated', { version: 1, payloadSchema: sellerActivatedSchema });
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as DomainError).code).toBe('SHARED_EVENT_CATALOG_DUPLICATE');
    }
  });

  it('throws on invalid event type format', () => {
    expect(() =>
      catalog.register('invalid', { version: 1, payloadSchema: sellerActivatedSchema }),
    ).toThrow(DomainError);
  });

  it('error includes correct code for invalid event type', () => {
    try {
      catalog.register('invalid', { version: 1, payloadSchema: sellerActivatedSchema });
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as DomainError).code).toBe('SHARED_EVENT_CATALOG_INVALID_TYPE');
    }
  });

  it('throws on version below 1', () => {
    expect(() =>
      catalog.register('seller.activated', { version: 0, payloadSchema: sellerActivatedSchema }),
    ).toThrow(DomainError);
  });

  it('error includes correct code for invalid version', () => {
    try {
      catalog.register('seller.activated', { version: 0, payloadSchema: sellerActivatedSchema });
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as DomainError).code).toBe('SHARED_EVENT_CATALOG_INVALID_VERSION');
    }
  });

  it('validates payload against registered schema', () => {
    catalog.register('seller.activated', { version: 1, payloadSchema: sellerActivatedSchema });

    const validPayload = {
      sellerProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      activatedAt: '2026-01-15T10:30:00.000Z',
    };

    expect(() => catalog.validatePayload('seller.activated', validPayload)).not.toThrow();
  });

  it('throws on invalid payload for registered event', () => {
    catalog.register('seller.activated', { version: 1, payloadSchema: sellerActivatedSchema });

    const invalidPayload = { sellerProfileId: 'not-a-uuid' };

    expect(() => catalog.validatePayload('seller.activated', invalidPayload)).toThrow(DomainError);
  });

  it('error includes correct code for invalid payload', () => {
    catalog.register('seller.activated', { version: 1, payloadSchema: sellerActivatedSchema });

    try {
      catalog.validatePayload('seller.activated', { sellerProfileId: 'not-a-uuid' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as DomainError).code).toBe('SHARED_EVENT_CATALOG_INVALID_PAYLOAD');
    }
  });

  it('throws when validating payload for unregistered event', () => {
    expect(() => catalog.validatePayload('unknown.event', {})).toThrow(DomainError);
  });

  it('error includes correct code for unregistered event', () => {
    try {
      catalog.validatePayload('unknown.event', {});
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as DomainError).code).toBe('SHARED_EVENT_CATALOG_NOT_FOUND');
    }
  });

  it('returns list of registered event types', () => {
    catalog.register('seller.activated', { version: 1, payloadSchema: sellerActivatedSchema });
    catalog.register('listing.published', { version: 1, payloadSchema: z.object({ listingId: z.string().uuid() }) });

    const types = catalog.listEventTypes();
    expect(types).toContain('seller.activated');
    expect(types).toContain('listing.published');
    expect(types).toHaveLength(2);
  });

  it('returns all entries', () => {
    catalog.register('seller.activated', { version: 1, payloadSchema: sellerActivatedSchema });

    const entries = catalog.getAllEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.eventType).toBe('seller.activated');
    expect(entries[0]?.version).toBe(1);
  });
});

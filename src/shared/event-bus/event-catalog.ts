import type { z } from 'zod';
import { DomainError } from '../errors/domain-error.js';

const EVENT_TYPE_PATTERN = /^[a-z]+\.[a-z_]+$/;

export interface EventCatalogEntry {
  readonly version: number;
  readonly payloadSchema: z.ZodType<unknown>;
}

interface RegisteredEntry extends EventCatalogEntry {
  readonly eventType: string;
}

/**
 * Central registry for all domain event types.
 *
 * Each domain maintains its own catalog instance. Events must be registered
 * before they can be validated or emitted. This prevents ad-hoc event creation
 * and enforces schema discipline.
 *
 * @see /project-knowledge/event-envelope-standard.md
 */
export class EventCatalog {
  private readonly events = new Map<string, EventCatalogEntry>();

  /**
   * Register an event type with its schema and version.
   *
   * @throws {DomainError} SHARED_EVENT_CATALOG_DUPLICATE if already registered
   * @throws {DomainError} SHARED_EVENT_CATALOG_INVALID_TYPE if format invalid
   * @throws {DomainError} SHARED_EVENT_CATALOG_INVALID_VERSION if version < 1
   */
  register(eventType: string, entry: EventCatalogEntry): void {
    if (!EVENT_TYPE_PATTERN.test(eventType)) {
      throw new DomainError(
        'SHARED_EVENT_CATALOG_INVALID_TYPE',
        `Event type must match domain.action format. Got: ${eventType}`,
        crypto.randomUUID(),
        false,
      );
    }

    if (entry.version < 1 || !Number.isInteger(entry.version)) {
      throw new DomainError(
        'SHARED_EVENT_CATALOG_INVALID_VERSION',
        `Event version must be a positive integer. Got: ${entry.version}`,
        crypto.randomUUID(),
        false,
      );
    }

    if (this.events.has(eventType)) {
      throw new DomainError(
        'SHARED_EVENT_CATALOG_DUPLICATE',
        `Event type already registered: ${eventType}`,
        crypto.randomUUID(),
        false,
      );
    }

    this.events.set(eventType, entry);
  }

  /**
   * Retrieve the catalog entry for an event type.
   */
  get(eventType: string): EventCatalogEntry | undefined {
    return this.events.get(eventType);
  }

  /**
   * Check if an event type is registered.
   */
  has(eventType: string): boolean {
    return this.events.has(eventType);
  }

  /**
   * Validate a payload against the registered schema for an event type.
   *
   * @throws {DomainError} SHARED_EVENT_CATALOG_NOT_FOUND if event type not registered
   * @throws {DomainError} SHARED_EVENT_CATALOG_INVALID_PAYLOAD if payload fails schema validation
   */
  validatePayload(eventType: string, payload: Record<string, unknown>): void {
    const entry = this.events.get(eventType);
    if (!entry) {
      throw new DomainError(
        'SHARED_EVENT_CATALOG_NOT_FOUND',
        `Event type not registered in catalog: ${eventType}`,
        crypto.randomUUID(),
        false,
      );
    }

    const result = entry.payloadSchema.safeParse(payload);
    if (!result.success) {
      throw new DomainError(
        'SHARED_EVENT_CATALOG_INVALID_PAYLOAD',
        `Payload validation failed for ${eventType}: ${result.error.message}`,
        crypto.randomUUID(),
        false,
      );
    }
  }

  /**
   * List all registered event types.
   */
  listEventTypes(): string[] {
    return Array.from(this.events.keys());
  }

  /**
   * Retrieve all registered entries with their event types.
   */
  getAllEntries(): readonly RegisteredEntry[] {
    return Array.from(this.events.entries()).map(([eventType, entry]) => ({
      eventType,
      ...entry,
    }));
  }
}

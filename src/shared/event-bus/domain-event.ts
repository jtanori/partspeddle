import { DomainError } from '../errors/domain-error.js';

const EVENT_TYPE_PATTERN = /^[a-z]+\.[a-z]+(_[a-z]+)*ed$/;
const DOMAIN_PATTERN = /^[a-z]+$/;
export const PAYLOAD_HARD_LIMIT_BYTES = 64 * 1024;
export const PAYLOAD_PREFERRED_LIMIT_BYTES = 32 * 1024;

export type DomainEventPayload = Record<string, unknown>;

export interface DomainEventMetadata {
  readonly traceparent?: string;
  readonly sourceIp?: string;
  readonly clientVersion?: string;
}

export interface DomainEventProps {
  readonly eventId?: string;
  readonly eventType: string;
  readonly eventVersion?: number;
  readonly schemaVersion?: number;
  readonly occurredAt?: string;
  readonly trustedTimestamp?: boolean;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly actorId: string;
  readonly domain: string;
  readonly aggregateId: string;
  readonly aggregateType?: string;
  readonly payload: DomainEventPayload;
  readonly metadata?: DomainEventMetadata;
}

/**
 * Canonical domain event envelope.
 *
 * Every event emitted by any bounded context must conform to this structure.
 * Events are immutable operational facts. Once created, they are written in stone.
 *
 * @see /project-knowledge/event-envelope-standard.md
 */
export class DomainEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly schemaVersion: number;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly causationId: string;
  readonly actorId: string;
  readonly domain: string;
  readonly aggregateId: string;
  readonly aggregateType?: string;
  readonly payload: DomainEventPayload;
  readonly metadata: DomainEventMetadata;

  constructor(props: DomainEventProps) {
    this.eventType = props.eventType;
    this.correlationId = props.correlationId;
    this.actorId = props.actorId;
    this.domain = props.domain;
    this.aggregateId = props.aggregateId;
    this.payload = props.payload;

    this._validateEventType();
    this._validateDomain();
    this._validatePayload();

    this.eventId = props.eventId ?? crypto.randomUUID();
    this.eventVersion = props.eventVersion ?? 1;
    this.schemaVersion = props.schemaVersion ?? 1;
    this.occurredAt =
      props.occurredAt && props.trustedTimestamp
        ? props.occurredAt
        : new Date().toISOString();
    this.causationId = props.causationId ?? props.correlationId;
    this.aggregateType = props.aggregateType;
    this.metadata = props.metadata ?? {};
  }

  /**
   * Serializes the event to a plain JSON envelope.
   */
  toJSON(): Record<string, unknown> {
    const envelope: Record<string, unknown> = {
      eventId: this.eventId,
      eventType: this.eventType,
      eventVersion: this.eventVersion,
      schemaVersion: this.schemaVersion,
      occurredAt: this.occurredAt,
      correlationId: this.correlationId,
      causationId: this.causationId,
      actorId: this.actorId,
      domain: this.domain,
      aggregateId: this.aggregateId,
      payload: this.payload,
      metadata: this.metadata,
    };
    if (this.aggregateType !== undefined) {
      envelope.aggregateType = this.aggregateType;
    }
    return envelope;
  }

  private _validateEventType(): void {
    if (!EVENT_TYPE_PATTERN.test(this.eventType)) {
      throw new DomainError(
        'SHARED_EVENT_INVALID_TYPE',
        `Event type must match domain.action format (past tense, lowercase). Got: ${this.eventType}`,
        this.correlationId,
        false,
      );
    }
  }

  private _validateDomain(): void {
    if (!DOMAIN_PATTERN.test(this.domain)) {
      throw new DomainError(
        'SHARED_EVENT_INVALID_DOMAIN',
        `Domain must be lowercase single word. Got: ${this.domain}`,
        this.correlationId,
        false,
      );
    }
  }

  private _validatePayload(): void {
    if (Object.keys(this.payload).length === 0) {
      throw new DomainError(
        'SHARED_EVENT_PAYLOAD_EMPTY',
        'Event payload cannot be empty. Include at least the aggregate state after the change.',
        this.correlationId,
        false,
      );
    }

    const size = new TextEncoder().encode(JSON.stringify(this.payload)).length;
    if (size > PAYLOAD_HARD_LIMIT_BYTES) {
      throw new DomainError(
        'SHARED_EVENT_PAYLOAD_TOO_LARGE',
        `Event payload exceeds hard limit of ${PAYLOAD_HARD_LIMIT_BYTES} bytes (${size} bytes).`,
        this.correlationId,
        false,
      );
    }
  }
}

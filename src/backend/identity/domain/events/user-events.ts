/**
 * User domain events — Identity bounded context.
 *
 * All events use past-tense naming per event-envelope-standard.md.
 * Schemas are registered in the domain event catalog for validation.
 */

import { z } from 'zod';
import { DomainEvent } from '../../../../shared/event-bus/domain-event.js';
import { EventCatalog } from '../../../../shared/event-bus/event-catalog.js';

// ─── Payload Schemas ──────────────────────────────────────────────────────────

export const UserCreatedPayloadSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
});

export const UserSuspendedPayloadSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().min(1),
  previousStatus: z.literal('active'),
});

export const UserReactivatedPayloadSchema = z.object({
  userId: z.string().uuid(),
  previousStatus: z.literal('suspended'),
});

export type UserCreatedPayload = z.infer<typeof UserCreatedPayloadSchema>;
export type UserSuspendedPayload = z.infer<typeof UserSuspendedPayloadSchema>;
export type UserReactivatedPayload = z.infer<typeof UserReactivatedPayloadSchema>;

// ─── Event Catalog ────────────────────────────────────────────────────────────

export const identityEventCatalog = new EventCatalog();

identityEventCatalog.register('identity.user_created', {
  version: 1,
  payloadSchema: UserCreatedPayloadSchema,
});

identityEventCatalog.register('identity.user_suspended', {
  version: 1,
  payloadSchema: UserSuspendedPayloadSchema,
});

identityEventCatalog.register('identity.user_reactivated', {
  version: 1,
  payloadSchema: UserReactivatedPayloadSchema,
});

// ─── Event Factory Functions ──────────────────────────────────────────────────

export function createUserCreatedEvent(
  payload: UserCreatedPayload,
  correlationId: string,
  actorId = 'system',
): DomainEvent {
  return new DomainEvent({
    eventType: 'identity.user_created',
    correlationId,
    actorId,
    domain: 'identity',
    aggregateId: payload.userId,
    aggregateType: 'user',
    payload,
  });
}

export function createUserSuspendedEvent(
  payload: UserSuspendedPayload,
  correlationId: string,
  actorId = 'system',
): DomainEvent {
  return new DomainEvent({
    eventType: 'identity.user_suspended',
    correlationId,
    actorId,
    domain: 'identity',
    aggregateId: payload.userId,
    aggregateType: 'user',
    payload,
  });
}

export function createUserReactivatedEvent(
  payload: UserReactivatedPayload,
  correlationId: string,
  actorId = 'system',
): DomainEvent {
  return new DomainEvent({
    eventType: 'identity.user_reactivated',
    correlationId,
    actorId,
    domain: 'identity',
    aggregateId: payload.userId,
    aggregateType: 'user',
    payload,
  });
}

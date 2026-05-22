/**
 * Seller domain events — Identity bounded context.
 *
 * All events use past-tense naming per event-envelope-standard.md.
 */

import { z } from 'zod';
import { DomainEvent } from '../../../../shared/event-bus/domain-event.js';
import { EventCatalog } from '../../../../shared/event-bus/event-catalog.js';

// ─── Payload Schemas ──────────────────────────────────────────────────────────

export const SellerOnboardingStepCompletedPayloadSchema = z.object({
  sellerProfileId: z.string().uuid(),
  userId: z.string().uuid(),
  step: z.enum(['identity', 'banking', 'tax', 'terms']),
});

export const SellerActivatedPayloadSchema = z.object({
  sellerProfileId: z.string().uuid(),
  userId: z.string().uuid(),
  stripeConnectAccountId: z.string().min(1),
  firstActivation: z.boolean(),
});

export const SellerSuspendedPayloadSchema = z.object({
  sellerProfileId: z.string().uuid(),
  userId: z.string().uuid(),
  reason: z.string().min(1),
});

export const SellerReactivatedPayloadSchema = z.object({
  sellerProfileId: z.string().uuid(),
  userId: z.string().uuid(),
  activatedAt: z.string().datetime().optional(),
});

export type SellerOnboardingStepCompletedPayload = z.infer<
  typeof SellerOnboardingStepCompletedPayloadSchema
>;
export type SellerActivatedPayload = z.infer<typeof SellerActivatedPayloadSchema>;
export type SellerSuspendedPayload = z.infer<typeof SellerSuspendedPayloadSchema>;
export type SellerReactivatedPayload = z.infer<typeof SellerReactivatedPayloadSchema>;

// ─── Event Catalog ────────────────────────────────────────────────────────────

export const sellerEventCatalog = new EventCatalog();

sellerEventCatalog.register('identity.seller_onboarding_step_completed', {
  version: 1,
  payloadSchema: SellerOnboardingStepCompletedPayloadSchema,
});

sellerEventCatalog.register('identity.seller_activated', {
  version: 1,
  payloadSchema: SellerActivatedPayloadSchema,
});

sellerEventCatalog.register('identity.seller_suspended', {
  version: 1,
  payloadSchema: SellerSuspendedPayloadSchema,
});

sellerEventCatalog.register('identity.seller_reactivated', {
  version: 1,
  payloadSchema: SellerReactivatedPayloadSchema,
});

// ─── Event Factory Functions ──────────────────────────────────────────────────

export function createSellerOnboardingStepCompletedEvent(
  payload: SellerOnboardingStepCompletedPayload,
  correlationId: string,
  actorId = 'system',
): DomainEvent {
  return new DomainEvent({
    eventType: 'identity.seller_onboarding_step_completed',
    correlationId,
    actorId,
    domain: 'identity',
    aggregateId: payload.sellerProfileId,
    aggregateType: 'seller_profile',
    payload,
  });
}

export function createSellerActivatedEvent(
  payload: SellerActivatedPayload,
  correlationId: string,
  actorId = 'system',
): DomainEvent {
  return new DomainEvent({
    eventType: 'identity.seller_activated',
    correlationId,
    actorId,
    domain: 'identity',
    aggregateId: payload.sellerProfileId,
    aggregateType: 'seller_profile',
    payload,
  });
}

export function createSellerSuspendedEvent(
  payload: SellerSuspendedPayload,
  correlationId: string,
  actorId = 'system',
): DomainEvent {
  return new DomainEvent({
    eventType: 'identity.seller_suspended',
    correlationId,
    actorId,
    domain: 'identity',
    aggregateId: payload.sellerProfileId,
    aggregateType: 'seller_profile',
    payload,
  });
}

export function createSellerReactivatedEvent(
  payload: SellerReactivatedPayload,
  correlationId: string,
  actorId = 'system',
): DomainEvent {
  return new DomainEvent({
    eventType: 'identity.seller_reactivated',
    correlationId,
    actorId,
    domain: 'identity',
    aggregateId: payload.sellerProfileId,
    aggregateType: 'seller_profile',
    payload,
  });
}

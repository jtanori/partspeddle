/**
 * Listing domain events — Marketplace bounded context.
 *
 * All events use past-tense naming per event-envelope-standard.md.
 */

import { DomainEvent } from '../../../../shared/event-bus/domain-event.js';

export function createListingCreatedEvent(
  payload: {
    listingId: string;
    title: string;
    sellerId: string;
    price: number;
    currency: string;
  },
  correlationId: string,
  actorId = 'system',
): DomainEvent {
  return new DomainEvent({
    eventType: 'marketplace.listing_created',
    correlationId,
    actorId,
    domain: 'marketplace',
    aggregateId: payload.listingId,
    aggregateType: 'listing',
    payload,
  });
}

export function createListingPublishedEvent(
  payload: { listingId: string; previousStatus: string },
  correlationId: string,
  actorId = 'system',
): DomainEvent {
  return new DomainEvent({
    eventType: 'marketplace.listing_published',
    correlationId,
    actorId,
    domain: 'marketplace',
    aggregateId: payload.listingId,
    aggregateType: 'listing',
    payload,
  });
}

export function createListingWithdrawnEvent(
  payload: { listingId: string; previousStatus: string },
  correlationId: string,
  actorId = 'system',
): DomainEvent {
  return new DomainEvent({
    eventType: 'marketplace.listing_delisted',
    correlationId,
    actorId,
    domain: 'marketplace',
    aggregateId: payload.listingId,
    aggregateType: 'listing',
    payload,
  });
}

export function createListingSoldEvent(
  payload: { listingId: string; buyerId: string },
  correlationId: string,
  actorId = 'system',
): DomainEvent {
  return new DomainEvent({
    eventType: 'marketplace.listing_purchased',
    correlationId,
    actorId,
    domain: 'marketplace',
    aggregateId: payload.listingId,
    aggregateType: 'listing',
    payload,
  });
}

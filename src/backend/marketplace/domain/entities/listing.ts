/**
 * Listing aggregate root — Marketplace bounded context.
 *
 * Manages listing lifecycle and status transitions. Invariants:
 * - Status transitions: draft → active → sold | withdrawn
 * - Active listings may be withdrawn or sold
 * - Sold and withdrawn listings are terminal states
 * - Price must be positive; currency must be 3-letter ISO code
 */

import { DomainEvent } from '../../../../shared/event-bus/domain-event.js';
import { DomainError } from '../../../../shared/errors/domain-error.js';
import type { ListingStatus } from '../../../../shared/contracts/marketplace/listing-schema.js';
import {
  createListingCreatedEvent,
  createListingPublishedEvent,
  createListingWithdrawnEvent,
  createListingSoldEvent,
} from '../events/listing-events.js';

const VALID_TRANSITIONS: Record<ListingStatus, readonly ListingStatus[]> = {
  draft: ['active'],
  active: ['sold', 'withdrawn'],
  sold: [],
  withdrawn: [],
};

export interface ListingProps {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly price: number;
  readonly currency: string;
  readonly sellerId: string;
  readonly status?: ListingStatus;
  readonly createdAt?: string;
}

export class Listing {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly price: number;
  readonly currency: string;
  readonly sellerId: string;
  private _status: ListingStatus;
  private _createdAt: string;
  private _uncommittedEvents: DomainEvent[] = [];

  private constructor(props: ListingProps) {
    this.id = props.id;
    this.title = props.title;
    this.description = props.description;
    this.price = props.price;
    this.currency = props.currency;
    this.sellerId = props.sellerId;
    this._status = props.status ?? 'draft';
    this._createdAt = props.createdAt ?? new Date().toISOString();
    this._validate();
  }

  // ─── Factory Methods ────────────────────────────────────────────────────────

  static create(
    props: Omit<ListingProps, 'status' | 'createdAt'>,
    correlationId: string,
    actorId = 'system',
  ): Listing {
    const listing = new Listing({
      ...props,
      status: 'draft',
      createdAt: new Date().toISOString(),
    });
    listing._uncommittedEvents.push(
      createListingCreatedEvent(
        {
          listingId: props.id,
          title: props.title,
          sellerId: props.sellerId,
          price: props.price,
          currency: props.currency,
        },
        correlationId,
        actorId,
      ),
    );
    return listing;
  }

  static rehydrate(props: ListingProps): Listing {
    return new Listing(props);
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  get status(): ListingStatus {
    return this._status;
  }

  get createdAt(): string {
    return this._createdAt;
  }

  get uncommittedEvents(): readonly DomainEvent[] {
    return this._uncommittedEvents;
  }

  // ─── Mutations ──────────────────────────────────────────────────────────────

  publish(correlationId: string, actorId = 'system'): void {
    this._assertTransitionTo('active');
    const previous = this._status;
    this._status = 'active';
    this._uncommittedEvents.push(
      createListingPublishedEvent({ listingId: this.id, previousStatus: previous }, correlationId, actorId),
    );
  }

  withdraw(correlationId: string, actorId = 'system'): void {
    this._assertTransitionTo('withdrawn');
    const previous = this._status;
    this._status = 'withdrawn';
    this._uncommittedEvents.push(
      createListingWithdrawnEvent({ listingId: this.id, previousStatus: previous }, correlationId, actorId),
    );
  }

  markAsSold(buyerId: string, correlationId: string, actorId = 'system'): void {
    this._assertTransitionTo('sold');
    this._status = 'sold';
    this._uncommittedEvents.push(
      createListingSoldEvent({ listingId: this.id, buyerId }, correlationId, actorId),
    );
  }

  clearEvents(): void {
    this._uncommittedEvents = [];
  }

  // ─── Invariants ─────────────────────────────────────────────────────────────

  private _assertTransitionTo(target: ListingStatus): void {
    if (!VALID_TRANSITIONS[this._status].includes(target)) {
      throw new DomainError(
        'MARKETPLACE_LISTING_INVALID_TRANSITION',
        `Cannot transition from ${this._status} to ${target}`,
        crypto.randomUUID(),
        false,
        { from: this._status, to: target },
      );
    }
  }

  private _validate(): void {
    if (!this.id) {
      throw new DomainError(
        'MARKETPLACE_LISTING_INVALID_ID',
        'Listing.id is required',
        crypto.randomUUID(),
        false,
      );
    }
    if (!this.title || this.title.length > 200) {
      throw new DomainError(
        'MARKETPLACE_LISTING_INVALID_TITLE',
        'Listing.title is required and must be ≤ 200 characters',
        crypto.randomUUID(),
        false,
      );
    }
    if (this.price <= 0) {
      throw new DomainError(
        'MARKETPLACE_LISTING_INVALID_PRICE',
        'Listing.price must be positive',
        crypto.randomUUID(),
        false,
      );
    }
    if (!this.currency || this.currency.length !== 3) {
      throw new DomainError(
        'MARKETPLACE_LISTING_INVALID_CURRENCY',
        'Listing.currency must be a 3-letter ISO code',
        crypto.randomUUID(),
        false,
      );
    }
    if (!this.sellerId) {
      throw new DomainError(
        'MARKETPLACE_LISTING_INVALID_SELLER',
        'Listing.sellerId is required',
        crypto.randomUUID(),
        false,
      );
    }
  }
}

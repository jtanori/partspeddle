import { describe, it, expect } from 'vitest';
import { Listing } from '../listing.js';
import { DomainError } from '../../../../../shared/errors/domain-error.js';

describe('Listing', () => {
  describe('creation', () => {
    it('creates with draft status and emits created event', () => {
      const listing = Listing.create(
        {
          id: '550e8400-e29b-41d4-a716-446655440003',
          title: 'Vintage Watch',
          description: 'A fine timepiece',
          price: 12500,
          currency: 'USD',
          sellerId: '550e8400-e29b-41d4-a716-446655440002',
        },
        'corr-1',
      );

      expect(listing.status).toBe('draft');
      expect(listing.title).toBe('Vintage Watch');
      expect(listing.price).toBe(12500);
      expect(listing.uncommittedEvents).toHaveLength(1);
      expect(listing.uncommittedEvents[0].eventType).toBe('marketplace.listing_created');
      expect(listing.uncommittedEvents[0].payload).toMatchObject({
        listingId: '550e8400-e29b-41d4-a716-446655440003',
        title: 'Vintage Watch',
        sellerId: '550e8400-e29b-41d4-a716-446655440002',
      });
    });

    it('rejects empty title', () => {
      expect(() =>
        Listing.create(
          {
            id: crypto.randomUUID(),
            title: '',
            description: 'Desc',
            price: 100,
            currency: 'USD',
            sellerId: crypto.randomUUID(),
          },
          'corr-1',
        ),
      ).toThrow(DomainError);
    });

    it('rejects title exceeding 200 characters', () => {
      expect(() =>
        Listing.create(
          {
            id: crypto.randomUUID(),
            title: 'a'.repeat(201),
            description: 'Desc',
            price: 100,
            currency: 'USD',
            sellerId: crypto.randomUUID(),
          },
          'corr-1',
        ),
      ).toThrow(DomainError);
    });

    it('rejects non-positive price', () => {
      expect(() =>
        Listing.create(
          {
            id: crypto.randomUUID(),
            title: 'Item',
            description: 'Desc',
            price: 0,
            currency: 'USD',
            sellerId: crypto.randomUUID(),
          },
          'corr-1',
        ),
      ).toThrow(DomainError);
    });

    it('rejects invalid currency code', () => {
      expect(() =>
        Listing.create(
          {
            id: crypto.randomUUID(),
            title: 'Item',
            description: 'Desc',
            price: 100,
            currency: 'US',
            sellerId: crypto.randomUUID(),
          },
          'corr-1',
        ),
      ).toThrow(DomainError);
    });
  });

  describe('rehydration', () => {
    it('rehydrates without emitting events', () => {
      const listing = Listing.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440003',
        title: 'Vintage Watch',
        description: 'A fine timepiece',
        price: 12500,
        currency: 'USD',
        sellerId: '550e8400-e29b-41d4-a716-446655440002',
        status: 'active',
        createdAt: '2024-06-01T09:00:00Z',
      });

      expect(listing.status).toBe('active');
      expect(listing.uncommittedEvents).toHaveLength(0);
    });
  });

  describe('status transitions', () => {
    it('draft → active emits published event', () => {
      const listing = Listing.create(
        {
          id: crypto.randomUUID(),
          title: 'Item',
          description: 'Desc',
          price: 100,
          currency: 'USD',
          sellerId: crypto.randomUUID(),
        },
        'corr-1',
      );
      listing.publish('corr-2');

      expect(listing.status).toBe('active');
      expect(listing.uncommittedEvents).toHaveLength(2);
      expect(listing.uncommittedEvents[1].eventType).toBe('marketplace.listing_published');
    });

    it('active → sold emits sold event', () => {
      const listing = Listing.create(
        {
          id: crypto.randomUUID(),
          title: 'Item',
          description: 'Desc',
          price: 100,
          currency: 'USD',
          sellerId: crypto.randomUUID(),
        },
        'corr-1',
      );
      listing.publish('corr-2');
      listing.clearEvents();
      listing.markAsSold('buyer-123', 'corr-3');

      expect(listing.status).toBe('sold');
      expect(listing.uncommittedEvents).toHaveLength(1);
      expect(listing.uncommittedEvents[0].eventType).toBe('marketplace.listing_purchased');
    });

    it('active → withdrawn emits withdrawn event', () => {
      const listing = Listing.create(
        {
          id: crypto.randomUUID(),
          title: 'Item',
          description: 'Desc',
          price: 100,
          currency: 'USD',
          sellerId: crypto.randomUUID(),
        },
        'corr-1',
      );
      listing.publish('corr-2');
      listing.clearEvents();
      listing.withdraw('corr-3');

      expect(listing.status).toBe('withdrawn');
      expect(listing.uncommittedEvents).toHaveLength(1);
      expect(listing.uncommittedEvents[0].eventType).toBe('marketplace.listing_delisted');
    });

    it('rejects invalid transitions', () => {
      const listing = Listing.create(
        {
          id: crypto.randomUUID(),
          title: 'Item',
          description: 'Desc',
          price: 100,
          currency: 'USD',
          sellerId: crypto.randomUUID(),
        },
        'corr-1',
      );

      expect(() => {
        listing.withdraw('corr-2');
      }).toThrow(DomainError);

      listing.publish('corr-2');
      expect(() => {
        listing.publish('corr-3');
      }).toThrow(DomainError);
    });

    it('sold is terminal', () => {
      const listing = Listing.create(
        {
          id: crypto.randomUUID(),
          title: 'Item',
          description: 'Desc',
          price: 100,
          currency: 'USD',
          sellerId: crypto.randomUUID(),
        },
        'corr-1',
      );
      listing.publish('corr-2');
      listing.markAsSold('buyer-123', 'corr-3');

      expect(() => {
        listing.withdraw('corr-4');
      }).toThrow(DomainError);
      expect(() => {
        listing.publish('corr-4');
      }).toThrow(DomainError);
    });
  });
});

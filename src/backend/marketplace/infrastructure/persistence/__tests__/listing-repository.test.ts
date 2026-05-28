import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryListingRepository } from '../listing-repository.memory.js';
import { Listing } from '../../../domain/entities/listing.js';

describe('InMemoryListingRepository', () => {
  let repository: InMemoryListingRepository;

  beforeEach(() => {
    repository = new InMemoryListingRepository();
  });

  describe('findById', () => {
    it('returns null when listing not found', async () => {
      const result = await repository.findById('non-existent-id');
      expect(result).toBeNull();
    });

    it('returns listing when found', async () => {
      const listing = Listing.create(
        {
          id: '550e8400-e29b-41d4-a716-446655440003',
          title: 'Vintage Watch',
          description: 'A fine timepiece',
          price: 12500,
          currency: 'USD',
          sellerId: '550e8400-e29b-41d4-a716-446655440002',
        },
        'corr-1'
      );
      await repository.save(listing);

      const result = await repository.findById(listing.id);
      expect(result).not.toBeNull();
      if (result === null) throw new Error('unreachable');
      expect(result.id).toBe(listing.id);
      expect(result.title).toBe('Vintage Watch');
      expect(result.status).toBe('draft');
    });
  });

  describe('findBySellerId', () => {
    it('returns empty array when no listings for seller', async () => {
      const results = await repository.findBySellerId('seller-with-no-listings');
      expect(results).toHaveLength(0);
    });

    it('returns listings sorted by createdAt descending', async () => {
      const sellerId = '550e8400-e29b-41d4-a716-446655440002';

      const listing1 = Listing.create(
        {
          id: '550e8400-e29b-41d4-a716-446655440003',
          title: 'First Item',
          description: 'Desc',
          price: 100,
          currency: 'USD',
          sellerId,
        },
        'corr-1'
      );

      const listing2 = Listing.create(
        {
          id: '550e8400-e29b-41d4-a716-446655440004',
          title: 'Second Item',
          description: 'Desc',
          price: 200,
          currency: 'USD',
          sellerId,
        },
        'corr-2'
      );

      await repository.save(listing1);
      await repository.save(listing2);

      const results = await repository.findBySellerId(sellerId);
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Second Item');
      expect(results[1].title).toBe('First Item');
    });

    it('does not return other sellers listings', async () => {
      const sellerA = 'seller-a';
      const sellerB = 'seller-b';

      await repository.save(
        Listing.create(
          {
            id: crypto.randomUUID(),
            title: 'A Item',
            description: 'Desc',
            price: 100,
            currency: 'USD',
            sellerId: sellerA,
          },
          'corr-1'
        )
      );

      const results = await repository.findBySellerId(sellerB);
      expect(results).toHaveLength(0);
    });
  });

  describe('save', () => {
    it('persists listing', async () => {
      const listing = Listing.create(
        {
          id: crypto.randomUUID(),
          title: 'Item',
          description: 'Desc',
          price: 100,
          currency: 'USD',
          sellerId: crypto.randomUUID(),
        },
        'corr-1'
      );

      await repository.save(listing);
      const found = await repository.findById(listing.id);
      expect(found).not.toBeNull();
      if (found === null) throw new Error('unreachable');
      expect(found.title).toBe('Item');
    });

    it('updates existing listing', async () => {
      const id = crypto.randomUUID();
      const listing = Listing.create(
        {
          id,
          title: 'Original',
          description: 'Desc',
          price: 100,
          currency: 'USD',
          sellerId: crypto.randomUUID(),
        },
        'corr-1'
      );
      await repository.save(listing);

      listing.publish('corr-2');
      await repository.save(listing);

      const found = await repository.findById(id);
      expect(found).not.toBeNull();
      if (found === null) throw new Error('unreachable');
      expect(found.status).toBe('active');
    });
  });

  describe('delete', () => {
    it('removes listing', async () => {
      const listing = Listing.create(
        {
          id: crypto.randomUUID(),
          title: 'Item',
          description: 'Desc',
          price: 100,
          currency: 'USD',
          sellerId: crypto.randomUUID(),
        },
        'corr-1'
      );
      await repository.save(listing);

      await repository.delete(listing.id);
      const found = await repository.findById(listing.id);
      expect(found).toBeNull();
    });
  });
});

/**
 * In-Memory Listing Repository — for unit testing.
 *
 * No outbox integration; events remain on the aggregate for test assertions.
 */

import type { IListingRepository } from '../../domain/repositories/listing-repository.js';
import { Listing } from '../../domain/entities/listing.js';

export class InMemoryListingRepository implements IListingRepository {
  private readonly listings = new Map<string, Listing>();

  findById(id: string): Promise<Listing | null> {
    const listing = this.listings.get(id);
    return Promise.resolve(
      listing
        ? Listing.rehydrate({
            id: listing.id,
            title: listing.title,
            description: listing.description,
            price: listing.price,
            currency: listing.currency,
            sellerId: listing.sellerId,
            status: listing.status,
            createdAt: listing.createdAt,
          })
        : null,
    );
  }

  findBySellerId(sellerId: string): Promise<Listing[]> {
    return Promise.resolve(
      Array.from(this.listings.values())
        .filter((l) => l.sellerId === sellerId)
        .map((l) =>
          Listing.rehydrate({
            id: l.id,
            title: l.title,
            description: l.description,
            price: l.price,
            currency: l.currency,
            sellerId: l.sellerId,
            status: l.status,
            createdAt: l.createdAt,
          }),
        )
        .sort((a, b) => {
          const dateCmp = b.createdAt.localeCompare(a.createdAt);
          return dateCmp !== 0 ? dateCmp : b.id.localeCompare(a.id);
        }),
    );
  }

  save(listing: Listing): Promise<void> {
    this.listings.set(
      listing.id,
      Listing.rehydrate({
        id: listing.id,
        title: listing.title,
        description: listing.description,
        price: listing.price,
        currency: listing.currency,
        sellerId: listing.sellerId,
        status: listing.status,
        createdAt: listing.createdAt,
      }),
    );
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.listings.delete(id);
    return Promise.resolve();
  }

  clear(): void {
    this.listings.clear();
  }
}

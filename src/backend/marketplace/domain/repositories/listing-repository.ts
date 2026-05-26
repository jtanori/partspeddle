import { Listing } from '../entities/listing.js';

export interface IListingRepository {
  findById(id: string): Promise<Listing | null>;
  findBySellerId(sellerId: string): Promise<Listing[]>;
  save(listing: Listing): Promise<void>;
  delete(id: string): Promise<void>;
}

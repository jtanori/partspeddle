/**
 * Marketplace domain API wrappers.
 *
 * Placeholder — to be implemented when marketplace domain is active.
 */

import { apiGet } from './client';
import type { ListingResponse } from '@/shared/contracts/marketplace/listing-schema';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function marketplaceUrl(path: string): string {
  return `${API_BASE}/marketplace${path}`;
}

export async function getListings(): Promise<ListingResponse[]> {
  return apiGet<ListingResponse[]>(marketplaceUrl('/listings'));
}

export async function getListing(listingId: string): Promise<ListingResponse> {
  return apiGet<ListingResponse>(marketplaceUrl(`/listings/${listingId}`));
}

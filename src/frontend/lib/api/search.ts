/**
 * Search domain API wrappers.
 *
 * Placeholder — to be implemented when search domain is active.
 */

import { apiGet } from './client';
import type { SearchResult } from '@/shared/contracts/search/index.js';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function searchUrl(path: string): string {
  return `${API_BASE}/search${path}`;
}

export async function searchListings(query: string): Promise<SearchResult[]> {
  return apiGet<SearchResult[]>(searchUrl(`?q=${encodeURIComponent(query)}`));
}

/**
 * Search Result Type Contracts (T4.5.1)
 *
 * Isomorphic TypeScript types for Algolia search results.
 * Used by frontend (display) and backend (sync/mapping).
 *
 * ZERO RUNTIME. ZERO SIDE EFFECTS. PURE CONTRACT.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Hit Schema — single document returned from Algolia
// ---------------------------------------------------------------------------

export const ListingHitSchema = z.object({
  objectID: z.string(),
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  category: z.enum([
    'watches',
    'jewelry',
    'collectibles',
    'vintage_cars',
    'memorabilia',
    'art',
    'other',
  ]),
  condition: z.enum(['new', 'like_new', 'excellent', 'good', 'fair', 'poor']),
  price: z.number().int().positive(),
  currency: z.literal('USD'),
  location: z.string().max(100).optional(),
  seller_id: z.string().uuid(),
  seller_name: z.string().min(1).max(100),
  status: z.enum(['draft', 'published', 'archived', 'sold']),
  thumbnail_url: z.string().url().optional(),
  images: z.array(z.string().url()).max(12).optional(),
  tags: z.array(z.string().max(30)).max(20).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  // Algolia metadata (added by sync, not part of domain model)
  _highlightResult: z.record(z.unknown()).optional(),
  _snippetResult: z.record(z.unknown()).optional(),
  _rankingInfo: z.record(z.unknown()).optional(),
});

export type ListingHit = z.infer<typeof ListingHitSchema>;

// ---------------------------------------------------------------------------
// Facet Schema — filter option with result count
// ---------------------------------------------------------------------------

export const FacetValueSchema = z.object({
  value: z.string(),
  count: z.number().int().nonnegative(),
  label: z.string().optional(),
});

export type FacetValue = z.infer<typeof FacetValueSchema>;

export const FacetSchema = z.object({
  attribute: z.string(),
  label: z.string(),
  values: z.array(FacetValueSchema),
});

export type Facet = z.infer<typeof FacetSchema>;

// ---------------------------------------------------------------------------
// Filter Schema — active filter in a search request
// ---------------------------------------------------------------------------

export const FilterSchema = z.object({
  attribute: z.string(),
  operator: z.enum(['=', '!=', '<', '>', '<=', '>=']),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export type Filter = z.infer<typeof FilterSchema>;

// ---------------------------------------------------------------------------
// Sort Option Schema
// ---------------------------------------------------------------------------

export const SortOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
  attribute: z.string(),
  direction: z.enum(['asc', 'desc']),
});

export type SortOption = z.infer<typeof SortOptionSchema>;

export const DEFAULT_SORT_OPTIONS: ReadonlyArray<SortOption> = [
  { label: 'Relevance', value: 'relevance', attribute: '_score', direction: 'desc' },
  { label: 'Price: Low to High', value: 'price_asc', attribute: 'price', direction: 'asc' },
  { label: 'Price: High to Low', value: 'price_desc', attribute: 'price', direction: 'desc' },
  { label: 'Newest', value: 'newest', attribute: 'created_at', direction: 'desc' },
] as const;

// ---------------------------------------------------------------------------
// Search Params Schema — frontend query state
// ---------------------------------------------------------------------------

export const SearchParamsSchema = z.object({
  query: z.string().max(200).optional(),
  filters: z.array(FilterSchema).max(10).optional(),
  sortBy: z.string().optional(),
  page: z.number().int().nonnegative().default(0),
  hitsPerPage: z.number().int().positive().max(100).default(20),
});

export type SearchParams = z.infer<typeof SearchParamsSchema>;

// ---------------------------------------------------------------------------
// Search Response Schema — shape returned by search adapter
// ---------------------------------------------------------------------------

export const SearchResponseSchema = z.object({
  hits: z.array(ListingHitSchema),
  page: z.number().int().nonnegative(),
  pages: z.number().int().nonnegative(),
  totalHits: z.number().int().nonnegative(),
  processingTimeMS: z.number().int().nonnegative(),
  facets: z.array(FacetSchema).optional(),
  query: z.string(),
  params: SearchParamsSchema,
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

// ---------------------------------------------------------------------------
// Empty State Contract
// ---------------------------------------------------------------------------

export const SearchEmptyStateSchema = z.object({
  query: z.string(),
  hasFilters: z.boolean(),
  suggestedActions: z.array(z.enum(['clear_filters', 'broaden_query', 'browse_categories'])),
});

export type SearchEmptyState = z.infer<typeof SearchEmptyStateSchema>;

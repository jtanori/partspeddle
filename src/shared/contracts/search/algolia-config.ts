/**
 * Algolia Configuration Contract (T4.5.1)
 *
 * Defines the SHAPE of Algolia client configuration WITHOUT
 * instantiating any client, importing Algolia SDK, or performing
 * any runtime side effects.
 *
 * This is a CONTRACT file. The actual client instantiation lives
 * in a frontend runtime ticket (future: T3.5 or T5.x).
 *
 * ZERO RUNTIME. ZERO SIDE EFFECTS. PURE CONTRACT.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Environment Variable Contract
// ---------------------------------------------------------------------------

/**
 * Required environment variables for Algolia configuration.
 * Consumers MUST validate these are present at build/runtime startup.
 */
export const ALGOLIA_ENV_VARS = {
  APP_ID: 'NEXT_PUBLIC_ALGOLIA_APP_ID',
  SEARCH_API_KEY: 'NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY',
  INDEX_NAME: 'NEXT_PUBLIC_ALGOLIA_INDEX_NAME',
} as const;

export type AlgoliaEnvVar = (typeof ALGOLIA_ENV_VARS)[keyof typeof ALGOLIA_ENV_VARS];

// ---------------------------------------------------------------------------
// Config Shape Contract
// ---------------------------------------------------------------------------

/**
 * Zod schema for validating Algolia configuration at startup.
 * Used by both frontend build-time validation and backend sync config.
 */
export const AlgoliaConfigSchema = z.object({
  appId: z.string().min(1).max(100),
  searchApiKey: z.string().min(1).max(200),
  indexName: z.string().regex(/^[a-z0-9_-]+$/),
});

export type AlgoliaConfig = z.infer<typeof AlgoliaConfigSchema>;

/**
 * Search-only key constraint contract.
 * Documents that the frontend MUST receive a search-only API key,
 * never an admin/write key.
 */
export const SEARCH_KEY_PERMISSIONS = ['search'] as const;
export type SearchKeyPermission = (typeof SEARCH_KEY_PERMISSIONS)[number];

// ---------------------------------------------------------------------------
// Client Options Contract (shape only, no instantiation)
// ---------------------------------------------------------------------------

/**
 * Shape of options passed to an Algolia search client constructor.
 * This is a TYPE-ONLY contract. No `new algoliasearch()` here.
 */
export interface AlgoliaClientOptionsContract {
  readonly appId: string;
  readonly apiKey: string;
  readonly options?: {
    readonly timeouts?: {
      readonly connect: number;
      readonly read: number;
      readonly write: number;
    };
  };
}

/**
 * Search client method signatures (contract only).
 * Future implementations MUST conform to this interface.
 */
export interface SearchClientContract {
  search<T>(indexName: string, query: string, options?: unknown): Promise<{
    hits: T[];
    nbHits: number;
    page: number;
    nbPages: number;
    processingTimeMS: number;
  }>;
}

// ---------------------------------------------------------------------------
// Adapter Interface Contract
// ---------------------------------------------------------------------------

/**
 * Adapter interface for search operations.
 * Both frontend InstantSearch adapter and backend test mocks
 * implement this contract.
 */
export interface SearchAdapterContract {
  readonly search: (params: import('./search-result.js').SearchParams) => Promise<import('./search-result.js').SearchResponse>;
  readonly getFacets: (attribute: string) => Promise<import('./search-result.js').Facet>;
}

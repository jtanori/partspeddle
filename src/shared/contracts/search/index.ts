/**
 * Search Domain Contract Barrel (T4.5.1)
 *
 * Public export surface for all search contracts.
 * Import from @/shared/contracts/search
 *
 * ZERO RUNTIME. ZERO SIDE EFFECTS. PURE CONTRACT.
 */

// Index schema contracts
export {
  SEARCHABLE_ATTRIBUTES,
  FILTERABLE_ATTRIBUTES,
  SORTABLE_ATTRIBUTES,
  RANKING_CRITERIA,
  FILTER_OPERATORS,
  CANONICAL_INDEX_SETTINGS,
  DEFAULT_INDEX_NAME,
  INDEX_NAME_PATTERN,
} from './algolia-index-schema.js';

export type {
  SearchableAttribute,
  FilterableAttribute,
  SortableAttribute,
  RankingCriterion,
  NumericFilterOperator,
  StringFilterOperator,
  FilterOperatorContract,
  AlgoliaIndexSettingsContract,
} from './algolia-index-schema.js';

// Search result contracts — import locally for type alias, then re-export
import type {
  ListingHit,
  FacetValue,
  Facet,
  Filter,
  SortOption,
  SearchParams,
  SearchResponse,
  SearchEmptyState,
} from './search-result.js';

export {
  ListingHitSchema,
  FacetValueSchema,
  FacetSchema,
  FilterSchema,
  SortOptionSchema,
  DEFAULT_SORT_OPTIONS,
  SearchParamsSchema,
  SearchResponseSchema,
  SearchEmptyStateSchema,
} from './search-result.js';

export type {
  ListingHit,
  FacetValue,
  Facet,
  Filter,
  SortOption,
  SearchParams,
  SearchResponse,
  SearchEmptyState,
};

/**
 * Backward-compatible alias for legacy consumers.
 * @deprecated Use ListingHit for listing-specific results.
 */
export type SearchResult = ListingHit;

// Config contracts
export { ALGOLIA_ENV_VARS, AlgoliaConfigSchema, SEARCH_KEY_PERMISSIONS } from './algolia-config.js';

export type {
  AlgoliaEnvVar,
  AlgoliaConfig,
  SearchKeyPermission,
  AlgoliaClientOptionsContract,
  SearchClientContract,
  SearchAdapterContract,
} from './algolia-config.js';

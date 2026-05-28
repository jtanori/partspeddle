/**
 * Algolia Index Schema Contract (T4.5.1)
 *
 * Source of truth for the Algolia search index configuration.
 * BOTH frontend search consumers AND backend sync producers MUST
 * align with this schema. Any mutation requires version bump and
 * downstream impact analysis per CONTRACT_LOCK governance.
 *
 * ZERO RUNTIME. ZERO SIDE EFFECTS. PURE CONTRACT.
 */

/**
 * Attributes that Algolia will search against when processing queries.
 * Ordered by relevance priority (first = highest priority).
 */
export const SEARCHABLE_ATTRIBUTES = [
  'title',
  'description',
  'category',
  'seller_name',
  'tags',
] as const;

export type SearchableAttribute = (typeof SEARCHABLE_ATTRIBUTES)[number];

/**
 * Attributes enabled for faceting / filtering.
 * Each entry declares filter type and cardinality expectations.
 */
export const FILTERABLE_ATTRIBUTES = [
  'category',
  'condition',
  'price',
  'location',
  'seller_id',
  'status',
] as const;

export type FilterableAttribute = (typeof FILTERABLE_ATTRIBUTES)[number];

/**
 * Filter operator contracts.
 * Defines which operators are valid per attribute type.
 */
export type NumericFilterOperator = '=' | '!=' | '<' | '>' | '<=' | '>=';
export type StringFilterOperator = '=' | '!=';

export interface FilterOperatorContract {
  attribute: FilterableAttribute;
  allowedOperators: readonly (NumericFilterOperator | StringFilterOperator)[];
  valueType: 'string' | 'number' | 'boolean';
}

export const FILTER_OPERATORS: readonly FilterOperatorContract[] = [
  { attribute: 'category', allowedOperators: ['='], valueType: 'string' },
  { attribute: 'condition', allowedOperators: ['='], valueType: 'string' },
  { attribute: 'price', allowedOperators: ['=', '<', '>', '<=', '>='], valueType: 'number' },
  { attribute: 'location', allowedOperators: ['='], valueType: 'string' },
  { attribute: 'seller_id', allowedOperators: ['='], valueType: 'string' },
  { attribute: 'status', allowedOperators: ['='], valueType: 'string' },
] as const;

/**
 * Attributes enabled for sorting.
 */
export const SORTABLE_ATTRIBUTES = ['price', 'created_at', 'relevance'] as const;

export type SortableAttribute = (typeof SORTABLE_ATTRIBUTES)[number];

/**
 * Ranking formula configuration contract.
 * Mirrors Algolia's ranking array but as an explicit contract.
 */
export const RANKING_CRITERIA = [
  'typo',
  'geo',
  'words',
  'filters',
  'proximity',
  'attribute',
  'exact',
  'custom',
] as const;

export type RankingCriterion = (typeof RANKING_CRITERIA)[number];

/**
 * Index settings contract — the complete configuration shape
 * that backend sync (T5.1) must apply to the Algolia index.
 */
export interface AlgoliaIndexSettingsContract {
  readonly searchableAttributes: readonly SearchableAttribute[];
  readonly attributesForFaceting: readonly FilterableAttribute[];
  readonly ranking: readonly RankingCriterion[];
  readonly customRanking: readonly string[];
  readonly hitsPerPage: number;
  readonly maxValuesPerFacet: number;
  readonly paginationLimitedTo: number;
}

/**
 * Canonical index settings. Backend sync MUST apply these exactly.
 */
export const CANONICAL_INDEX_SETTINGS: AlgoliaIndexSettingsContract = {
  searchableAttributes: [...SEARCHABLE_ATTRIBUTES],
  attributesForFaceting: [...FILTERABLE_ATTRIBUTES],
  ranking: [...RANKING_CRITERIA],
  customRanking: ['desc(created_at)'],
  hitsPerPage: 20,
  maxValuesPerFacet: 100,
  paginationLimitedTo: 1000,
} as const;

/**
 * Index name contract. Enforces naming convention.
 */
export const INDEX_NAME_PATTERN = /^[a-z0-9_-]+$/;
export const DEFAULT_INDEX_NAME = 'listings' as const;

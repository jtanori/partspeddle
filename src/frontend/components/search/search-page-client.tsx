'use client';

import { useMemo } from 'react';
import { InstantSearch, Configure } from 'react-instantsearch';
import { liteClient as algoliasearch } from 'algoliasearch/lite';
import type { LiteClient } from 'algoliasearch/lite';
import { SearchInput } from './search-input';
import { FilterSidebar } from './filter-sidebar';
import { ResultList } from './result-list';
import { PaginationControls } from './pagination';

interface SearchPageClientProps {
  readonly appId: string;
  readonly apiKey: string;
  readonly indexName: string;
}

interface RouteState {
  q?: string;
  page?: string;
  category?: string;
  condition?: string;
  location?: string;
  minPrice?: string;
  maxPrice?: string;
}

interface IndexUiState {
  query?: string;
  page?: number;
  refinementList?: Record<string, string[]>;
  range?: Record<string, { min?: number; max?: number }>;
}

/**
 * Search Page Client Component
 *
 * Wraps Algolia InstantSearch with URL state routing.
 * URL is the source of truth for all search state.
 *
 * Ticket: T3.5
 */
export function SearchPageClient({ appId, apiKey, indexName }: SearchPageClientProps) {
  const searchClient = useMemo<LiteClient>(
    () => algoliasearch(appId, apiKey),
    [appId, apiKey]
  );

  const routing = useMemo(
    () => ({
      stateMapping: {
        stateToRoute(uiState: Record<string, unknown>): RouteState {
          const indexUiState = uiState[indexName] as IndexUiState | undefined;
          if (!indexUiState) return {};

          const refinementList = indexUiState.refinementList ?? {};
          const priceRange = indexUiState.range?.price;

          return {
            q: indexUiState.query || undefined,
            page: indexUiState.page != null ? String(indexUiState.page + 1) : undefined,
            category: refinementList.category?.join('~') || undefined,
            condition: refinementList.condition?.join('~') || undefined,
            location: refinementList.location?.join('~') || undefined,
            minPrice: priceRange?.min != null ? String(priceRange.min) : undefined,
            maxPrice: priceRange?.max != null ? String(priceRange.max) : undefined,
          };
        },
        routeToState(routeState: RouteState): Record<string, unknown> {
          const refinementList: Record<string, string[]> = {};
          if (routeState.category) refinementList.category = routeState.category.split('~');
          if (routeState.condition) refinementList.condition = routeState.condition.split('~');
          if (routeState.location) refinementList.location = routeState.location.split('~');

          const range: Record<string, { min?: number; max?: number }> = {};
          if (routeState.minPrice || routeState.maxPrice) {
            range.price = {
              min: routeState.minPrice ? Number(routeState.minPrice) : undefined,
              max: routeState.maxPrice ? Number(routeState.maxPrice) : undefined,
            };
          }

          return {
            [indexName]: {
              query: routeState.q,
              page: routeState.page ? Number(routeState.page) - 1 : undefined,
              refinementList: Object.keys(refinementList).length > 0 ? refinementList : undefined,
              range: Object.keys(range).length > 0 ? range : undefined,
            },
          };
        },
      },
      router: {
        createURL({ routeState, location }: { routeState: RouteState; location: Location }) {
          const urlParts = location.href.match(/^(.*?)\/?(?:\?.*)?$/) || ['', location.href];
          const baseUrl = `${urlParts[1]}/`;

          const queryParameters: string[] = [];
          if (routeState.q) queryParameters.push(`q=${encodeURIComponent(routeState.q)}`);
          if (routeState.page && routeState.page !== '1') queryParameters.push(`page=${routeState.page}`);
          if (routeState.category) queryParameters.push(`category=${encodeURIComponent(routeState.category)}`);
          if (routeState.condition) queryParameters.push(`condition=${encodeURIComponent(routeState.condition)}`);
          if (routeState.location) queryParameters.push(`location=${encodeURIComponent(routeState.location)}`);
          if (routeState.minPrice) queryParameters.push(`minPrice=${routeState.minPrice}`);
          if (routeState.maxPrice) queryParameters.push(`maxPrice=${routeState.maxPrice}`);

          return queryParameters.length
            ? `${baseUrl}?${queryParameters.join('&')}`
            : baseUrl;
        },
        parseURL({ location }: { location: Location }): RouteState {
          const params = new URLSearchParams(location.search);
          return {
            q: params.get('q') || undefined,
            page: params.get('page') || undefined,
            category: params.get('category') || undefined,
            condition: params.get('condition') || undefined,
            location: params.get('location') || undefined,
            minPrice: params.get('minPrice') || undefined,
            maxPrice: params.get('maxPrice') || undefined,
          };
        },
      },
    }),
    [indexName]
  );

  return (
    <InstantSearch
      searchClient={searchClient}
      indexName={indexName}
      routing={routing as never}
      future={{ preserveSharedStateOnUnmount: true }}
    >
      <Configure hitsPerPage={20} />

      <div className="container mx-auto px-4 py-8">
        {/* Search Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">Search Listings</h1>
          <SearchInput />
        </div>

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Filter Sidebar */}
          <aside className="w-full lg:w-64 flex-shrink-0">
            <FilterSidebar />
          </aside>

          {/* Results */}
          <main className="flex-1 min-w-0">
            <ResultList />
            <div className="mt-8 flex justify-center">
              <PaginationControls />
            </div>
          </main>
        </div>
      </div>
    </InstantSearch>
  );
}

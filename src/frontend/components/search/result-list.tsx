'use client';

import { useHits, useInstantSearch } from 'react-instantsearch';
import { Card, CardContent } from '@/frontend/components/ui/card';
import { Badge } from '@/frontend/components/ui/badge';
import { Skeleton } from '@/frontend/components/ui/skeleton';
import { SearchX, ImageOff } from 'lucide-react';
import type { Hit } from 'instantsearch.js';

/**
 * Search Result List
 *
 * Displays Algolia hits with loading and empty states.
 * Responsive grid layout.
 *
 * Ticket: T3.5
 */
export function ResultList() {
  const { hits } = useHits();
  const { status } = useInstantSearch();
  const isLoading = status === 'loading' || status === 'stalled';

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (hits.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {hits.length} result{hits.length !== 1 ? 's' : ''}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {hits.map((hit) => (
          <HitCard key={hit.objectID} hit={hit} />
        ))}
      </div>
    </div>
  );
}

function HitCard({ hit }: { readonly hit: Hit }) {
  const title = String(hit.title ?? 'Untitled Listing');
  const price = hit.price != null ? `$${Number(hit.price).toLocaleString()}` : null;
  const category = String(hit.category ?? '').replace('_', ' ');
  const condition = String(hit.condition ?? '').replace('_', ' ');
  const thumbnail = hit.thumbnail_url ? String(hit.thumbnail_url) : null;
  const location = hit.location ? String(hit.location) : null;

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer group">
      <div className="aspect-[4/3] bg-muted relative overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <ImageOff className="h-8 w-8" />
          </div>
        )}
        {condition && (
          <Badge
            variant="secondary"
            className="absolute top-2 right-2 capitalize"
          >
            {condition}
          </Badge>
        )}
      </div>
      <CardContent className="p-4">
        <h3 className="font-semibold line-clamp-2 mb-1">{title}</h3>
        <div className="flex items-center justify-between">
          {price && (
            <span className="text-lg font-bold text-primary">{price}</span>
          )}
          {category && (
            <Badge variant="outline" className="text-xs capitalize">
              {category}
            </Badge>
          )}
        </div>
        {location && (
          <p className="text-xs text-muted-foreground mt-2">{location}</p>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <Skeleton className="aspect-[4/3]" />
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState() {
  const { indexUiState } = useInstantSearch();
  const hasQuery = Boolean(indexUiState.query);
  const hasFilters = Boolean(
    indexUiState.refinementList && Object.keys(indexUiState.refinementList).length > 0
  );

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <SearchX className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">No results found</h3>
      <p className="text-muted-foreground max-w-md">
        {hasQuery || hasFilters
          ? "Try adjusting your search terms or filters to find what you're looking for."
          : 'Start typing to search for listings.'}
      </p>
    </div>
  );
}

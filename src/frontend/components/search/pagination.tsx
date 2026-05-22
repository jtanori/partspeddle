'use client';

import { usePagination } from 'react-instantsearch';
import { Button } from '@/frontend/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Pagination Controls
 *
 * Page numbers with prev/next navigation.
 * Responsive: shows fewer page numbers on mobile.
 *
 * Ticket: T3.5
 */
export function PaginationControls() {
  const {
    pages,
    currentRefinement,
    nbPages,
    isFirstPage,
    isLastPage,
    canRefine,
    refine,
  } = usePagination({ padding: 1 });

  if (nbPages <= 1) return null;

  return (
    <nav aria-label="Search results pagination" className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={isFirstPage}
        onClick={() => refine(currentRefinement - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {pages.map((page) => {
        const isCurrent = page === currentRefinement;

        return (
          <Button
            key={page}
            variant={isCurrent ? 'default' : 'outline'}
            size="sm"
            className="min-w-[2.5rem]"
            disabled={!canRefine}
            onClick={() => refine(page)}
            aria-label={`Page ${page + 1}`}
            aria-current={isCurrent ? 'page' : undefined}
          >
            {page + 1}
          </Button>
        );
      })}

      <Button
        variant="outline"
        size="sm"
        disabled={isLastPage}
        onClick={() => refine(currentRefinement + 1)}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}

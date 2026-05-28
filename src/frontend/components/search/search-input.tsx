'use client';

import { useState, useEffect } from 'react';
import { useSearchBox } from 'react-instantsearch';
import { Input } from '@/frontend/components/ui/input';
import { Button } from '@/frontend/components/ui/button';
import { Search, X } from 'lucide-react';

/**
 * Search Input with Autocomplete
 *
 * Uses Algolia InstantSearch SearchBox widget.
 * Debounced input for performance.
 *
 * Ticket: T3.5
 */
export function SearchInput() {
  const { query, refine } = useSearchBox();
  const [inputValue, setInputValue] = useState(query);

  // Sync input with URL state
  useEffect(() => {
    setInputValue(query);
  }, [query]);

  // Debounced refine
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue !== query) {
        refine(inputValue);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
    };
  }, [inputValue, query, refine]);

  const handleClear = () => {
    setInputValue('');
    refine('');
  };

  return (
    <div className="relative max-w-2xl">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search listings..."
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
        }}
        className="pl-10 pr-10 h-12 text-lg"
        aria-label="Search listings"
      />
      {inputValue && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
          onClick={handleClear}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

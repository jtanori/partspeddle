'use client';

import { useRefinementList, useRange } from 'react-instantsearch';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import { SlidersHorizontal, X } from 'lucide-react';

/**
 * Filter Sidebar
 *
 * Provides refinement lists for category, condition, location
 * and a custom price range input.
 *
 * Ticket: T3.5
 */
export function FilterSidebar() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </h2>
      </div>

      <CategoryFilter />
      <ConditionFilter />
      <LocationFilter />
      <PriceFilter />
    </div>
  );
}

function CategoryFilter() {
  const { items, refine } = useRefinementList({ attribute: 'category' });

  return (
    <FilterSection title="Category">
      <div className="space-y-2">
        {items.map((item) => (
          <label
            key={item.value}
            className="flex items-center gap-2 cursor-pointer hover:bg-muted rounded px-2 py-1"
          >
            <input
              type="checkbox"
              checked={item.isRefined}
              onChange={() => {
                refine(item.value);
              }}
              className="rounded border-gray-300"
            />
            <span className="flex-1 text-sm capitalize">{item.label.replace('_', ' ')}</span>
            <Badge variant="secondary" className="text-xs">
              {item.count}
            </Badge>
          </label>
        ))}
      </div>
    </FilterSection>
  );
}

function ConditionFilter() {
  const { items, refine } = useRefinementList({ attribute: 'condition' });

  return (
    <FilterSection title="Condition">
      <div className="space-y-2">
        {items.map((item) => (
          <label
            key={item.value}
            className="flex items-center gap-2 cursor-pointer hover:bg-muted rounded px-2 py-1"
          >
            <input
              type="checkbox"
              checked={item.isRefined}
              onChange={() => {
                refine(item.value);
              }}
              className="rounded border-gray-300"
            />
            <span className="flex-1 text-sm capitalize">{item.label.replace('_', ' ')}</span>
            <Badge variant="secondary" className="text-xs">
              {item.count}
            </Badge>
          </label>
        ))}
      </div>
    </FilterSection>
  );
}

function LocationFilter() {
  const { items, refine } = useRefinementList({ attribute: 'location', limit: 10 });

  if (items.length === 0) return null;

  return (
    <FilterSection title="Location">
      <div className="space-y-2">
        {items.map((item) => (
          <label
            key={item.value}
            className="flex items-center gap-2 cursor-pointer hover:bg-muted rounded px-2 py-1"
          >
            <input
              type="checkbox"
              checked={item.isRefined}
              onChange={() => {
                refine(item.value);
              }}
              className="rounded border-gray-300"
            />
            <span className="flex-1 text-sm">{item.label}</span>
            <Badge variant="secondary" className="text-xs">
              {item.count}
            </Badge>
          </label>
        ))}
      </div>
    </FilterSection>
  );
}

function PriceFilter() {
  const { range, refine } = useRange({ attribute: 'price' });
  const [min, setMin] = useState<string>('');
  const [max, setMax] = useState<string>('');

  // Sync with URL state
  useEffect(() => {
    if (range.min != null) setMin(String(range.min));
    if (range.max != null) setMax(String(range.max));
  }, [range.min, range.max]);

  const handleApply = () => {
    refine([
      min ? Number(min) : undefined,
      max ? Number(max) : undefined,
    ]);
  };

  const handleClear = () => {
    setMin('');
    setMax('');
    refine([undefined, undefined]);
  };

  const hasValue = min || max;

  return (
    <FilterSection title="Price Range" rightAction={hasValue ? (
      <Button variant="ghost" size="sm" className="h-6 px-2" onClick={handleClear}>
        <X className="h-3 w-3 mr-1" />
        Clear
      </Button>
    ) : null}>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder="Min"
          value={min}
          onChange={(e) => {
            setMin(e.target.value);
          }}
          className="h-8"
          min={0}
        />
        <span className="text-muted-foreground">—</span>
        <Input
          type="number"
          placeholder="Max"
          value={max}
          onChange={(e) => {
            setMax(e.target.value);
          }}
          className="h-8"
          min={0}
        />
      </div>
      <Button size="sm" className="w-full mt-2" onClick={handleApply}>
        Apply
      </Button>
    </FilterSection>
  );
}

// ---------------------------------------------------------------------------
// Filter Section Wrapper
// ---------------------------------------------------------------------------

import { useState, type ReactNode, useEffect } from 'react';

function FilterSection({
  title,
  children,
  rightAction,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly rightAction?: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm">{title}</h3>
        <div className="flex items-center gap-1">
          {rightAction}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => {
              setIsOpen(!isOpen);
            }}
          >
            {isOpen ? '−' : '+'}
          </Button>
        </div>
      </div>
      {isOpen && children}
    </div>
  );
}

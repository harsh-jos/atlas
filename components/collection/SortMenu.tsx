'use client';

import { ArrowUpDown } from 'lucide-react';
import { Popover, PopoverItem } from '@/components/ui/Popover';
import { SORT_OPTIONS, collectionFilterHref, type CollectionSort } from '@/lib/collectionFilters';

export interface SortMenuProps {
  conceptSlug: string;
  sort: CollectionSort;
  tag?: string;
}

/** Sort collapses to one icon + the active choice, not a row of always-visible links. */
export function SortMenu({ conceptSlug, sort, tag }: SortMenuProps) {
  const activeLabel = SORT_OPTIONS.find((option) => option.value === sort)?.label ?? 'Sort';

  return (
    <Popover
      renderTrigger={({ onClick, open }) => (
        <button
          type="button"
          onClick={onClick}
          aria-expanded={open}
          aria-label="Sort"
          className="focus-ring flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12.5px] font-medium text-ink transition-colors duration-[var(--dur-fast)] hover:bg-surface-soft hover:text-ink"
        >
          <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
          {activeLabel}
        </button>
      )}
    >
      {SORT_OPTIONS.map((option) => (
        <PopoverItem
          key={option.value}
          href={collectionFilterHref(conceptSlug, { sort: option.value, tag })}
          active={option.value === sort}
        >
          {option.label}
        </PopoverItem>
      ))}
    </Popover>
  );
}

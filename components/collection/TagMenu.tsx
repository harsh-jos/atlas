'use client';

import Link from 'next/link';
import { Tag as TagIcon, X } from 'lucide-react';
import { Popover, PopoverItem } from '@/components/ui/Popover';
import { collectionFilterHref, type CollectionSort } from '@/lib/collectionFilters';

export interface TagMenuProps {
  conceptSlug: string;
  sort: CollectionSort;
  tags: string[];
  totalTags: number;
  activeTag?: string;
}

/**
 * Tags collapse to one icon button that opens the full list, plus — only when
 * a filter is active — a single removable chip. Replaces a pill for every
 * tag rendered inline, which ate a lot of vertical space for what's really a
 * filter, not primary content.
 */
export function TagMenu({ conceptSlug, sort, tags, totalTags, activeTag }: TagMenuProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Popover
        renderTrigger={({ onClick, open }) => (
          <button
            type="button"
            onClick={onClick}
            aria-expanded={open}
            aria-label="Filter by tag"
            className="focus-ring flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium text-muted transition-colors duration-[var(--dur-fast)] hover:bg-surface-soft hover:text-ink"
          >
            <TagIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Tags
          </button>
        )}
      >
        <div className="max-h-64 overflow-y-auto">
          {tags.map((entryTag) => (
            <PopoverItem
              key={entryTag}
              href={collectionFilterHref(conceptSlug, {
                sort,
                tag: entryTag === activeTag ? undefined : entryTag,
              })}
              active={entryTag === activeTag}
            >
              {entryTag}
            </PopoverItem>
          ))}
        </div>
        {totalTags > tags.length && (
          <p className="px-2.5 pt-1 text-[11.5px] text-faint">
            +{totalTags - tags.length} more not shown
          </p>
        )}
      </Popover>

      {activeTag && (
        <Link
          href={collectionFilterHref(conceptSlug, { sort })}
          className="focus-ring flex h-8 items-center gap-1 rounded-full bg-accent-soft pl-2.5 pr-2 text-[12.5px] font-medium text-accent transition-colors duration-[var(--dur-fast)] hover:bg-accent-soft/70"
        >
          {activeTag}
          <X className="h-3 w-3" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

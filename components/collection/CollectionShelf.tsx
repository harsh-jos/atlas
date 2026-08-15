import type * as React from 'react';
import Link from 'next/link';
import { cleanTitle } from '@/lib/utils';

export interface CollectionShelfProps {
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  /** Title of the most recently touched entry — the quiet "alive" signal. */
  recentEntryTitle: string | null;
}

/**
 * A single collection card on the Library home. No counts, no dashboard stats:
 * a color dot, the name, a calm description, and a faint trace of the last
 * thing touched here. Browsing-first by design.
 */
export function CollectionShelf({
  name,
  slug,
  description,
  color,
  recentEntryTitle,
}: CollectionShelfProps) {
  const accent = color || 'var(--faint)';

  return (
    <Link href={`/collections/${slug}`} className="focus-ring group block rounded-card">
      <div className="flex h-full min-h-[8.5rem] flex-col rounded-card border bg-surface p-5 shadow-card transition-shadow duration-[var(--dur-fast)] group-hover:shadow-card-hover">
        <div
          aria-hidden="true"
          className="identity-mark h-9 w-9 shrink-0 rounded-[10px]"
          style={{ '--mark-color': accent } as React.CSSProperties}
        />
        <h3
          title={name}
          className="mt-3 truncate text-[15px] font-semibold tracking-[-0.01em] text-ink"
        >
          {name}
        </h3>
        {description && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted">
            {description}
          </p>
        )}

        <p className="mt-auto truncate pt-5 text-xs text-faint">
          {recentEntryTitle ? cleanTitle(recentEntryTitle) : 'No entries yet'}
        </p>
      </div>
    </Link>
  );
}

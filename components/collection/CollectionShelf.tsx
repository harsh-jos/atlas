import Link from 'next/link';
import { cleanTitle } from '@/lib/utils';

export interface CollectionShelfProps {
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  /** Title of the most recently touched entry — the quiet "alive" signal on the spine. */
  recentEntryTitle: string | null;
}

/**
 * A single shelf on the Library home — a book-like card with a thin colored
 * spine. No counts, no dashboard stats: just the name, a calm description, and
 * a faint trace of the last thing touched here. Browsing-first by design.
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
    <Link href={`/collections/${slug}`} className="group block">
      <div className="relative flex h-full min-h-[9.5rem] flex-col overflow-hidden rounded-card border-thin bg-surface py-5 pl-5 pr-5 shadow-card transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-card-hover">
        {/* Spine — thins to a hairline, widens a touch on hover, like a book pulled out */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[3px] transition-all duration-300 group-hover:w-1.5"
          style={{ backgroundColor: accent }}
        />
        {/* Soft collection-colored bloom from the spine on hover. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-12 top-0 h-36 w-36 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-20"
          style={{ backgroundColor: accent }}
        />

        <h3 className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink">{name}</h3>
        {description && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted">
            {description}
          </p>
        )}

        <div className="mt-auto pt-5">
          {recentEntryTitle ? (
            <div className="flex items-center gap-2 text-[12px] text-faint">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: accent }}
              />
              <span className="truncate">{cleanTitle(recentEntryTitle)}</span>
            </div>
          ) : (
            <div className="text-[12px] text-faint">No entries yet</div>
          )}
        </div>
      </div>
    </Link>
  );
}

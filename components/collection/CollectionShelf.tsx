import Link from 'next/link';

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
      <div className="relative flex h-full min-h-[9rem] flex-col overflow-hidden rounded-[12px] border-thin bg-surface py-5 pl-5 pr-5 shadow-card transition-all duration-200 group-hover:-translate-y-px group-hover:shadow-card-hover">
        {/* Spine — thins to a hairline, widens a touch on hover, like a book pulled out */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[3px] transition-all duration-200 group-hover:w-1"
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
              <span className="truncate">{recentEntryTitle}</span>
            </div>
          ) : (
            <div className="text-[12px] text-faint">No entries yet</div>
          )}
        </div>
      </div>
    </Link>
  );
}

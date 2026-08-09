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
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
          />
          <h3 title={name} className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
            {name}
          </h3>
        </div>
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

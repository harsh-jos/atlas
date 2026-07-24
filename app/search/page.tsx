import Link from 'next/link';
import { Search } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { apiGet } from '@/lib/api';
import type { SearchHit } from '@/lib/api-types';
import { cleanTitle, formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
  }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = q?.trim() || '';
  const results = query ? await apiGet<SearchHit[]>(`/search?q=${encodeURIComponent(query)}`) : [];

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <div className="mb-7">
        <h1 className="font-title text-[32px] font-bold leading-none tracking-[-0.03em] text-ink">Search</h1>
        {query && (
          <p className="mt-3 text-[15px] text-muted">
            {results.length} {results.length === 1 ? 'result' : 'results'} for{' '}
            <span className="text-ink">{query}</span>
          </p>
        )}
      </div>

      {!query ? (
        <div className="flex items-center gap-4 rounded-card border-thin bg-surface p-6 shadow-card">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-soft text-faint">
            <Search className="h-4 w-4" />
          </div>
          <p className="max-w-xl text-[15px] leading-6 text-muted">
            Search across entry titles, summaries, and body content.
          </p>
        </div>
      ) : results.length > 0 ? (
        <div className="overflow-hidden rounded-card border-thin bg-surface shadow-card divide-y divide-[var(--hairline)]">
          {results.map((result) => (
            <Link
              key={result.slug}
              href={`/entries/${result.slug}`}
              className="group block p-5 transition-colors hover:bg-surface-soft"
            >
              <span className="flex items-center gap-1.5 text-[12px] text-muted">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: result.conceptColor ?? 'var(--faint)' }}
                />
                {result.concept}
              </span>
              <h2 className="mt-2 font-display text-[16px] font-semibold tracking-[-0.02em] text-ink">
                {cleanTitle(result.title)}
              </h2>
              {(result.excerpt || result.summary) && (
                <p className="mt-1 max-w-3xl break-words text-[13px] leading-6 text-muted">
                  {result.excerpt ?? result.summary}
                </p>
              )}
              <span className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-faint">
                {result.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded-full bg-surface-soft px-2 py-0.5">
                    {tag}
                  </span>
                ))}
                {result.sourceCount > 0 && (
                  <span>
                    {result.sourceCount} {result.sourceCount === 1 ? 'source' : 'sources'}
                  </span>
                )}
                <span>{formatDate(result.updatedAt)}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Search className="h-4 w-4" />}
          title="No entries matched"
          description={`Nothing found for “${query}”. Try a different term or broaden the search.`}
        />
      )}
    </div>
  );
}

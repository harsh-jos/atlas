import Link from 'next/link';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { searchEntries, searchResultExcerpt, SEARCH_RESULT_LIMIT } from '@/lib/search';
import { cleanTitle, timeAgo } from '@/lib/utils';

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
  }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = q?.trim() || '';
  const results = await searchEntries(query);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <div className="mb-7">
        <h1 className="font-display text-[32px] font-bold leading-none tracking-[-0.03em] text-ink">Search</h1>
        {query && (
          <p className="mt-3 text-[15px] text-muted">
            {results.length === SEARCH_RESULT_LIMIT ? 'Top ' : ''}
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
            Search across entry titles, summaries, body content, and tags.
          </p>
        </div>
      ) : results.length > 0 ? (
        <div className="overflow-hidden rounded-card border-thin bg-surface shadow-card divide-y divide-[var(--hairline)]">
          {results.map((result) => (
            <Link
              key={result.id}
              href={`/entries/${result.slug}`}
              className="group block p-5 transition-colors hover:bg-surface-soft"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: result.collectionColor || 'var(--faint)' }}
                />
                <span className="text-[12px] text-muted">{result.collectionName}</span>
              </div>
              <h2 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-ink">
                {cleanTitle(result.title)}
              </h2>
              <p className="mt-1 max-w-3xl break-words text-[13px] leading-6 text-muted">
                {searchResultExcerpt(result, query)}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {result.tags.slice(0, 4).map((tag) => (
                  <Badge key={tag} variant="default" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
                <span className="text-[11px] text-faint">
                  {result.sourceCount} {result.sourceCount === 1 ? 'source' : 'sources'}
                </span>
                <span className="font-mono text-[11px] text-faint">
                  {timeAgo(result.updatedAt)}
                </span>
              </div>
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

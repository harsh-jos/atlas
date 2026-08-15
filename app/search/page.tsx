import type { ReactNode } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchField } from '@/components/search/SearchField';
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
    <PageContainer>
      <PageHeader title="Search your atlas" />

      <SearchField defaultValue={query} />

      {query && (
        <p className="mb-5 mt-6 text-[13.5px] text-muted">
          {results.length} {results.length === 1 ? 'result' : 'results'} for{' '}
          <span className="text-ink">“{query}”</span>
        </p>
      )}

      <div className={query ? undefined : 'mt-7'}>
        {!query ? (
          <EmptyState
            icon={<Search className="h-4 w-4" />}
            title="Start typing to search"
            description="Search across entry titles, summaries, and body content."
          />
        ) : results.length > 0 ? (
          <ul className="overflow-hidden rounded-card border bg-surface shadow-card divide-y">
            {results.map((result) => (
              <li key={result.slug}>
                <Link
                  href={`/entries/${result.slug}`}
                  className="group block p-5 transition-colors duration-[var(--dur-fast)] hover:bg-surface-soft"
                >
                  <span className="flex items-center gap-1.5 text-[12px] text-muted">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: result.conceptColor ?? 'var(--faint)' }}
                    />
                    {result.concept}
                  </span>
                  <h2 className="mt-2 text-[15px] font-semibold tracking-[-0.01em] text-ink">
                    {highlightMatch(cleanTitle(result.title), query)}
                  </h2>
                  {(result.excerpt || result.summary) && (
                    <p className="mt-1 max-w-3xl break-words text-[13px] leading-6 text-muted">
                      {highlightMatch(result.excerpt ?? result.summary ?? '', query)}
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
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Search className="h-4 w-4" />}
            title="No matches"
            description={`Nothing found for “${query}”. Try a different term or broaden the search.`}
          />
        )}
      </div>
    </PageContainer>
  );
}

/** Wraps every case-insensitive occurrence of `query` in `text` with a soft highlight. */
function highlightMatch(text: string, query: string): ReactNode {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  if (parts.length === 1) return text;

  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={index} className="rounded-[3px] bg-accent-soft text-ink">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

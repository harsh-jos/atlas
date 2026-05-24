import Link from 'next/link';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { searchEntries, searchResultExcerpt } from '@/lib/search';
import { timeAgo } from '@/lib/utils';

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
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-lg font-medium text-zinc-900">Search</h1>
        {query && (
          <p className="mt-2 text-sm text-zinc-500">
            {results.length} {results.length === 1 ? 'result' : 'results'} for{' '}
            <span className="text-zinc-700">{query}</span>
          </p>
        )}
      </div>

      {!query ? (
        <div className="rounded-lg border-thin border-zinc-200/80 bg-white p-8">
          <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md border-thin border-zinc-200/80 text-zinc-400">
            <Search className="h-4 w-4" />
          </div>
          <p className="max-w-xl text-sm leading-6 text-zinc-500">
            Search across entry titles, summaries, body content, and tags.
          </p>
        </div>
      ) : results.length > 0 ? (
        <div className="overflow-hidden rounded-lg border-thin border-zinc-200/80 bg-white divide-y divide-zinc-100/70">
          {results.map((result) => (
            <Link
              key={result.id}
              href={`/entries/${result.slug}`}
              className="group block p-4 transition-colors hover:bg-zinc-50/60"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: result.collectionColor || '#888888' }}
                />
                <span className="text-xs text-zinc-400">{result.collectionName}</span>
                <Badge variant={result.status === 'PUBLISHED' ? 'success' : 'secondary'}>
                  {result.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                </Badge>
              </div>
              <h2 className="text-sm font-medium text-zinc-800 transition-colors group-hover:text-zinc-950">
                {result.title}
              </h2>
              <p className="mt-1 max-w-3xl text-xs leading-6 text-zinc-500">
                {searchResultExcerpt(result, query)}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {result.tags.slice(0, 4).map((tag) => (
                  <Badge key={tag} variant="default" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
                <span className="text-[10px] text-zinc-400">
                  {result.sourceCount} {result.sourceCount === 1 ? 'source' : 'sources'}
                </span>
                <span className="text-[10px] font-mono text-zinc-300">
                  {timeAgo(result.updatedAt)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border-thin border-zinc-200/80 bg-white p-8">
          <p className="text-sm text-zinc-500">No entries matched this search.</p>
        </div>
      )}
    </div>
  );
}

import { Search } from 'lucide-react';

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
  }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-lg font-medium text-zinc-900">Search</h1>
        {q && <p className="mt-2 text-sm text-zinc-500">Query: {q}</p>}
      </div>

      <div className="rounded-lg border-thin border-zinc-200/80 bg-white p-8">
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md border-thin border-zinc-200/80 text-zinc-400">
          <Search className="h-4 w-4" />
        </div>
        <p className="max-w-xl text-sm leading-6 text-zinc-500">
          Full-text search across entries, summaries, bodies, and tags is the next implementation slice.
        </p>
      </div>
    </div>
  );
}

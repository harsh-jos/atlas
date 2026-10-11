'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, LayoutGrid, List, ArrowUpRight, Layers } from 'lucide-react';
import { Input } from '@/components/shadcn/input';
import { Button } from '@/components/shadcn/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/select';
import { CollectionShelf } from './CollectionShelf';
import type { ConceptSummary } from '@/lib/api-types';
import { EmptyState } from '@/components/ui/EmptyState';
export function LibraryBrowser({
  concepts,
  paginated,
}: {
  concepts: ConceptSummary[];
  paginated: boolean;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const visible = useMemo(() => {
    const filtered = concepts.filter((c) =>
      `${c.name} ${c.description || ''}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
    );
    if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'count')
      filtered.sort((a, b) => b.artifactCount - a.artifactCount);
    return filtered;
  }, [concepts, query, sort]);
  return (
    <section aria-label="Saved concepts">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Your concepts</h2>
          <span className="rounded-md bg-surface-soft px-2 py-0.5 text-[11px] text-muted">
            {concepts.length}
            {paginated ? ' on this page' : ''}
          </span>
        </div>
        <Link
          href="/graph"
          className="flex items-center gap-1 text-xs text-muted hover:text-accent"
        >
          See connections
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              paginated ? 'Filter concepts on this page…' : 'Find a concept…'
            }
            aria-label="Filter concepts"
            className="h-10 rounded-lg bg-canvas/60 pl-9 shadow-none"
          />
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger
            aria-label="Sort concepts"
            className="h-10 min-w-36 bg-white"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Recently updated</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="count">Most explanations</SelectItem>
          </SelectContent>
        </Select>
        <div
          className="flex rounded-lg border p-1"
          role="group"
          aria-label="Library layout"
        >
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Grid view"
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
            className={
              view === 'grid' ? 'bg-accent-soft text-accent' : 'text-faint'
            }
          >
            <LayoutGrid />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="List view"
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
            className={
              view === 'list' ? 'bg-accent-soft text-accent' : 'text-faint'
            }
          >
            <List />
          </Button>
        </div>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          icon={<Search className="size-5" />}
          title="No concepts found"
          description="Try another name or clear the filter."
        />
      ) : view === 'grid' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((c) => (
            <CollectionShelf
              key={c.id}
              name={c.name}
              slug={c.slug}
              description={c.description}
              color={c.color}
              recentEntryTitle={c.recentArtifactTitle}
              entryCount={c.artifactCount}
            />
          ))}
        </div>
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border">
          {visible.map((c) => (
            <Link
              key={c.id}
              href={`/collections/${c.slug}`}
              className="flex items-center gap-3 p-3 hover:bg-canvas"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Layers className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-medium">{c.name}</h3>
                <p className="mt-1 truncate text-xs text-muted">
                  {c.description || 'Explore this concept'}
                </p>
              </div>
              <span className="text-xs text-muted">
                {c.artifactCount} saved
              </span>
              <ArrowUpRight className="size-4 text-faint" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

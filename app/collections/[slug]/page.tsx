import type * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { CollectionHeader } from '@/components/collection/CollectionHeader';
import { EntryCard } from '@/components/entry/EntryCard';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FileText } from 'lucide-react';
import {
  CollectionSort,
  CollectionStatusFilter,
  getCollectionPageData,
  parseCollectionSort,
  parseCollectionStatusFilter,
} from '@/lib/collection-data';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface CollectionPageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    status?: string;
    tag?: string;
    sort?: string;
  }>;
}

const statusFilters: Array<{ label: string; value: CollectionStatusFilter }> = [
  { label: 'Published', value: 'published' },
  { label: 'Drafts', value: 'draft' },
  { label: 'All', value: 'all' },
];

const sortOptions: Array<{ label: string; value: CollectionSort }> = [
  { label: 'Updated', value: 'updated' },
  { label: 'Created', value: 'created' },
  { label: 'Title', value: 'title' },
];

export default async function CollectionPage({ params, searchParams }: CollectionPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const status = parseCollectionStatusFilter(query.status);
  const sort = parseCollectionSort(query.sort);
  const tag = query.tag?.trim() || undefined;

  const data = await getCollectionPageData({
    slug,
    status,
    tag,
    sort,
  });

  if (!data) {
    notFound();
  }

  const { collection, tags } = data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Breadcrumb
        className="mb-6"
        items={[
          { label: 'Home', href: '/' },
          { label: collection.name },
        ]}
      />

      <CollectionHeader
        name={collection.name}
        description={collection.description}
        color={collection.color}
        entryCount={collection._count.entries}
      />

      <div className="mb-4 flex flex-col gap-3 border-t-thin border-b-thin border-zinc-200/80 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {statusFilters.map((filter) => (
            <FilterLink
              key={filter.value}
              href={collectionFilterHref(collection.slug, {
                status: filter.value,
                sort,
                tag,
              })}
              active={status === filter.value}
            >
              {filter.label}
            </FilterLink>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-400">Sort by</span>
          {sortOptions.map((option) => (
            <FilterLink
              key={option.value}
              href={collectionFilterHref(collection.slug, {
                status,
                sort: option.value,
                tag,
              })}
              active={sort === option.value}
            >
              {option.label}
            </FilterLink>
          ))}
        </div>
      </div>

      {tags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-400">Tags</span>
          {tag && (
            <Link href={collectionFilterHref(collection.slug, { status, sort })}>
              <Badge variant="secondary">Clear tag</Badge>
            </Link>
          )}
          {tags.map((entryTag) => (
            <Link
              key={entryTag}
              href={collectionFilterHref(collection.slug, {
                status,
                sort,
                tag: entryTag,
              })}
            >
              <Badge variant={tag === entryTag ? 'accent' : 'default'}>{entryTag}</Badge>
            </Link>
          ))}
        </div>
      )}

      {collection.entries.length > 0 ? (
        <div className="overflow-hidden rounded-lg border-thin border-zinc-200/80 bg-white divide-y divide-zinc-100/60">
          {collection.entries.map((entry) => (
            <EntryCard
              key={entry.id}
              title={entry.title}
              slug={entry.slug}
              summary={entry.summary}
              tags={entry.tags}
              status={entry.status}
              sourceCount={entry._count.sources}
              updatedAt={entry.updatedAt}
            />
          ))}
        </div>
      ) : collection._count.entries > 0 ? (
        <EmptyState
          icon={<FileText className="h-4 w-4" />}
          title="No entries match this filter"
          description="Nothing here for the current status or tag selection."
          action={{ label: 'View all entries', href: `/collections/${collection.slug}?status=all` }}
        />
      ) : (
        <EmptyState
          icon={<FileText className="h-4 w-4" />}
          title="No entries in this collection yet"
          description="Use “New entry” in the top navigation to add the first one."
        />
      )}
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
        active ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
      )}
    >
      {children}
    </Link>
  );
}

function collectionFilterHref(
  slug: string,
  options: {
    status: CollectionStatusFilter;
    sort: CollectionSort;
    tag?: string;
  }
) {
  const searchParams = new URLSearchParams();

  if (options.status !== 'published') {
    searchParams.set('status', options.status);
  }

  if (options.sort !== 'updated') {
    searchParams.set('sort', options.sort);
  }

  if (options.tag) {
    searchParams.set('tag', options.tag);
  }

  const query = searchParams.toString();

  return query ? `/collections/${slug}?${query}` : `/collections/${slug}`;
}

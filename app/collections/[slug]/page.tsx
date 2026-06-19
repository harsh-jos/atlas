import type * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { CollectionDetailHeader } from '@/components/collection/CollectionDetailHeader';
import { EntryCard } from '@/components/entry/EntryCard';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FileText } from 'lucide-react';
import {
  CollectionSort,
  getCollectionPageData,
  parseCollectionSort,
} from '@/lib/collection-data';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface CollectionPageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    tag?: string;
    sort?: string;
  }>;
}

const sortOptions: Array<{ label: string; value: CollectionSort }> = [
  { label: 'Updated', value: 'updated' },
  { label: 'Created', value: 'created' },
  { label: 'Title', value: 'title' },
];

export default async function CollectionPage({ params, searchParams }: CollectionPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const sort = parseCollectionSort(query.sort);
  const tag = query.tag?.trim() || undefined;

  const data = await getCollectionPageData({
    slug,
    tag,
    sort,
  });

  if (!data) {
    notFound();
  }

  const { collection, tags } = data;

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <Breadcrumb
        className="mb-6"
        items={[
          { label: 'Library', href: '/' },
          { label: collection.name },
        ]}
      />

      <CollectionDetailHeader
        slug={collection.slug}
        name={collection.name}
        description={collection.description}
        color={collection.color}
        entryCount={collection._count.entries}
      />

      <div className="mb-5 flex flex-wrap items-center gap-1.5 border-b-thin py-3.5">
        <span className="text-[13px] text-faint">Sort by</span>
        {sortOptions.map((option) => (
          <FilterLink
            key={option.value}
            href={collectionFilterHref(collection.slug, {
              sort: option.value,
              tag,
            })}
            active={sort === option.value}
          >
            {option.label}
          </FilterLink>
        ))}
      </div>

      {tags.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-faint">Tags</span>
          {tag && (
            <Link href={collectionFilterHref(collection.slug, { sort })}>
              <Badge variant="secondary">Clear tag</Badge>
            </Link>
          )}
          {tags.map((entryTag) => (
            <Link
              key={entryTag}
              href={collectionFilterHref(collection.slug, {
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
        <div className="overflow-hidden rounded-[12px] border-thin bg-surface shadow-card divide-y divide-[var(--hairline)]">
          {collection.entries.map((entry) => (
            <EntryCard
              key={entry.id}
              title={entry.title}
              slug={entry.slug}
              summary={entry.summary}
              tags={entry.tags}
              sourceCount={entry._count.sources}
              updatedAt={entry.updatedAt}
            />
          ))}
        </div>
      ) : collection._count.entries > 0 ? (
        <EmptyState
          icon={<FileText className="h-4 w-4" />}
          title="No entries match this tag"
          description="Nothing here for the current tag selection."
          action={{ label: 'View all entries', href: `/collections/${collection.slug}` }}
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
        'rounded-full px-3 py-1 text-[13px] font-medium transition-colors',
        active ? 'bg-ink text-white' : 'text-muted hover:bg-black/[0.05] hover:text-ink'
      )}
    >
      {children}
    </Link>
  );
}

function collectionFilterHref(
  slug: string,
  options: {
    sort: CollectionSort;
    tag?: string;
  }
) {
  const searchParams = new URLSearchParams();

  if (options.sort !== 'updated') {
    searchParams.set('sort', options.sort);
  }

  if (options.tag) {
    searchParams.set('tag', options.tag);
  }

  const query = searchParams.toString();

  return query ? `/collections/${slug}?${query}` : `/collections/${slug}`;
}

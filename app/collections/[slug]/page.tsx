import type * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { CollectionDetailHeader } from '@/components/collection/CollectionDetailHeader';
import { EntryCard } from '@/components/entry/EntryCard';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import {
  CollectionSort,
  getCollectionPageData,
  parseCollectionPage,
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
    page?: string;
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
  const page = parseCollectionPage(query.page);
  const tag = query.tag?.trim() || undefined;

  const data = await getCollectionPageData({
    slug,
    tag,
    sort,
    page,
  });

  if (!data) {
    notFound();
  }

  const { collection, entries, tags, totalTagCount, filteredCount, pageSize } = data;
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  const rangeStart = filteredCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, filteredCount);

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
          {totalTagCount > tags.length && (
            <span className="text-[12px] text-faint">
              +{totalTagCount - tags.length} more
            </span>
          )}
        </div>
      )}

      {entries.length > 0 ? (
        <>
          <div className="overflow-hidden rounded-[12px] border-thin bg-surface shadow-card divide-y divide-[var(--hairline)]">
            {entries.map((entry) => (
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

          {totalPages > 1 && (
            <nav
              className="mt-5 flex items-center justify-between gap-4"
              aria-label="Pagination"
            >
              <span className="text-[13px] text-faint">
                Showing {rangeStart}–{rangeEnd} of {filteredCount}
              </span>
              <div className="flex items-center gap-2">
                <PageLink
                  href={collectionFilterHref(collection.slug, { sort, tag, page: page - 1 })}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </PageLink>
                <PageLink
                  href={collectionFilterHref(collection.slug, { sort, tag, page: page + 1 })}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </PageLink>
              </div>
            </nav>
          )}
        </>
      ) : filteredCount > 0 ? (
        <EmptyState
          icon={<FileText className="h-4 w-4" />}
          title="Nothing on this page"
          description="This page is past the end of the list."
          action={{ label: 'Back to the first page', href: `/collections/${collection.slug}` }}
        />
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

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const className =
    'inline-flex items-center gap-1 rounded-lg border-thin px-3 py-1.5 text-[13px] font-medium transition-colors';

  if (disabled) {
    return (
      <span className={cn(className, 'cursor-not-allowed text-faint opacity-50')} aria-disabled="true">
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={cn(className, 'text-muted hover:bg-surface-soft hover:text-ink')}>
      {children}
    </Link>
  );
}

function collectionFilterHref(
  slug: string,
  options: {
    sort: CollectionSort;
    tag?: string;
    page?: number;
  }
) {
  const searchParams = new URLSearchParams();

  if (options.sort !== 'updated') {
    searchParams.set('sort', options.sort);
  }

  if (options.tag) {
    searchParams.set('tag', options.tag);
  }

  if (options.page && options.page > 1) {
    searchParams.set('page', String(options.page));
  }

  const query = searchParams.toString();

  return query ? `/collections/${slug}?${query}` : `/collections/${slug}`;
}

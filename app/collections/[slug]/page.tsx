import type * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { CollectionDetailHeader } from '@/components/collection/CollectionDetailHeader';
import { EntryCard } from '@/components/entry/EntryCard';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { apiGetOrNull } from '@/lib/api';
import type { ConceptPage } from '@/lib/api-types';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type CollectionSort = 'updated' | 'created' | 'title';

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

function parseSort(value?: string): CollectionSort {
  return value === 'created' || value === 'title' ? value : 'updated';
}

function parsePage(value?: string): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
}

export default async function CollectionPage({ params, searchParams }: CollectionPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const sort = parseSort(query.sort);
  const page = parsePage(query.page);
  const tag = query.tag?.trim() || undefined;

  const data = await apiGetOrNull<ConceptPage>(
    `/concepts/${encodeURIComponent(slug)}?${new URLSearchParams({
      sort,
      page: String(page),
      ...(tag ? { tag } : {}),
    })}`
  );

  if (!data) {
    notFound();
  }

  const { concept, artifacts, tags, totalTags, matched, pageSize } = data;
  const totalPages = Math.max(1, Math.ceil(matched / pageSize));
  const rangeStart = matched === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, matched);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <Breadcrumb
        className="mb-6"
        items={[
          { label: 'Library', href: '/' },
          { label: concept.name },
        ]}
      />

      <CollectionDetailHeader
        slug={concept.slug}
        name={concept.name}
        description={concept.description}
        color={concept.color}
        entryCount={concept.artifactCount}
      />

      <div className="mb-5 flex flex-wrap items-center gap-1.5 border-b-thin py-3.5">
        <span className="text-[13px] text-faint">Sort by</span>
        {sortOptions.map((option) => (
          <FilterLink
            key={option.value}
            href={collectionFilterHref(concept.slug, {
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
            <Link href={collectionFilterHref(concept.slug, { sort })}>
              <Badge variant="secondary">Clear tag</Badge>
            </Link>
          )}
          {tags.map((entryTag) => (
            <Link
              key={entryTag}
              href={collectionFilterHref(concept.slug, {
                sort,
                tag: entryTag,
              })}
            >
              <Badge variant={tag === entryTag ? 'accent' : 'default'}>{entryTag}</Badge>
            </Link>
          ))}
          {totalTags > tags.length && (
            <span className="text-[12px] text-faint">
              +{totalTags - tags.length} more
            </span>
          )}
        </div>
      )}

      {artifacts.length > 0 ? (
        <>
          <div className="overflow-hidden rounded-card border-thin bg-surface shadow-card divide-y divide-[var(--hairline)]">
            {artifacts.map((artifact) => (
              <EntryCard
                key={artifact.id}
                title={artifact.title}
                slug={artifact.slug}
                summary={artifact.summary}
                tags={artifact.tags}
                sourceCount={artifact.sourceCount}
                updatedAt={artifact.updatedAt}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <nav
              className="mt-5 flex items-center justify-between gap-4"
              aria-label="Pagination"
            >
              <span className="text-[13px] text-faint">
                Showing {rangeStart}–{rangeEnd} of {matched}
              </span>
              <div className="flex items-center gap-2">
                <PageLink
                  href={collectionFilterHref(concept.slug, { sort, tag, page: page - 1 })}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </PageLink>
                <PageLink
                  href={collectionFilterHref(concept.slug, { sort, tag, page: page + 1 })}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </PageLink>
              </div>
            </nav>
          )}
        </>
      ) : matched > 0 ? (
        <EmptyState
          icon={<FileText className="h-4 w-4" />}
          title="Nothing on this page"
          description="This page is past the end of the list."
          action={{ label: 'Back to the first page', href: `/collections/${concept.slug}` }}
        />
      ) : concept.artifactCount > 0 ? (
        <EmptyState
          icon={<FileText className="h-4 w-4" />}
          title="No entries match this tag"
          description="Nothing here for the current tag selection."
          action={{ label: 'View all entries', href: `/collections/${concept.slug}` }}
        />
      ) : (
        <EmptyState
          icon={<FileText className="h-4 w-4" />}
          title="No entries in this collection yet"
          description="Nothing has been added here so far."
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

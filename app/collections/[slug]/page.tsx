import type * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { CollectionDetailHeader } from '@/components/collection/CollectionDetailHeader';
import { SortMenu } from '@/components/collection/SortMenu';
import { TagMenu } from '@/components/collection/TagMenu';
import { EntryCard } from '@/components/entry/EntryCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageContainer } from '@/components/layout/PageHeader';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import {
  ConceptConnections,
  type ConceptNeighbourhood,
} from '@/components/collection/ConceptConnections';
import { apiGetOrNull } from '@/lib/api';
import { collectionFilterHref, parseSort } from '@/lib/collectionFilters';
import type { ConceptPage } from '@/lib/api-types';
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

function parsePage(value?: string): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
}

export default async function CollectionPage({
  params,
  searchParams,
}: CollectionPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const sort = parseSort(query.sort);
  const page = parsePage(query.page);
  const tag = query.tag?.trim() || undefined;

  const data = await apiGetOrNull<ConceptPage>(
    `/concepts/${encodeURIComponent(slug)}?${new URLSearchParams({
      sort,
      page: String(page),
      ...(tag ? { tag } : {}),
    })}`,
  );

  if (!data) {
    notFound();
  }

  const graph = await apiGetOrNull<ConceptNeighbourhood>(
    `/concepts/${encodeURIComponent(slug)}/neighbourhood`,
  );

  const { concept, artifacts, tags, totalTags, matched, pageSize } = data;
  const totalPages = Math.max(1, Math.ceil(matched / pageSize));
  const rangeStart = matched === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, matched);

  return (
    <PageContainer>
      <Breadcrumb
        className="mb-6"
        items={[{ label: 'Library', href: '/' }, { label: concept.name }]}
      />

      <CollectionDetailHeader
        slug={concept.slug}
        name={concept.name}
        description={concept.description}
        color={concept.color}
        entryCount={concept.artifactCount}
      />

      {graph && <ConceptConnections slug={slug} graph={graph} />}

      <div className="mb-5 flex flex-wrap items-center gap-2 border-b py-3.5">
        <SortMenu conceptSlug={concept.slug} sort={sort} tag={tag} />
        {tags.length > 0 && (
          <TagMenu
            conceptSlug={concept.slug}
            sort={sort}
            tags={tags}
            totalTags={totalTags}
            activeTag={tag}
          />
        )}
      </div>

      {artifacts.length > 0 ? (
        <>
          <div className="divide-y overflow-hidden rounded-card border bg-surface shadow-card">
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
                  href={collectionFilterHref(concept.slug, {
                    sort,
                    tag,
                    page: page - 1,
                  })}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </PageLink>
                <PageLink
                  href={collectionFilterHref(concept.slug, {
                    sort,
                    tag,
                    page: page + 1,
                  })}
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
          action={{
            label: 'Back to the first page',
            href: `/collections/${concept.slug}`,
          }}
        />
      ) : concept.artifactCount > 0 ? (
        <EmptyState
          icon={<FileText className="h-4 w-4" />}
          title="No explanations match this tag"
          description="Nothing here for the current tag selection."
          action={{
            label: 'View all entries',
            href: `/collections/${concept.slug}`,
          }}
        />
      ) : (
        <EmptyState
          icon={<FileText className="h-4 w-4" />}
          title="A space for your next explanation"
          description="Explore this concept with Atlas, then ask to save an explanation here."
        />
      )}
    </PageContainer>
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
    'focus-ring inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors duration-[var(--dur-fast)]';

  if (disabled) {
    return (
      <span
        className={cn(
          className,
          'cursor-not-allowed select-none text-faint opacity-50',
        )}
        aria-disabled="true"
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        className,
        'text-muted hover:bg-surface-soft hover:text-ink',
      )}
    >
      {children}
    </Link>
  );
}

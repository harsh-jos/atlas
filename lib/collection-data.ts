import { Prisma } from '@prisma/client';
import db from '@/lib/db';

export type CollectionSort = 'updated' | 'created' | 'title';

/** Entries per page — keeps the rendered DOM and the RSC payload bounded. */
export const COLLECTION_PAGE_SIZE = 50;

/** Most-used tags shown as filter chips; the long tail is hidden to avoid a wall of pills. */
const MAX_VISIBLE_TAGS = 24;

export interface CollectionPageOptions {
  slug: string;
  tag?: string;
  sort: CollectionSort;
  page: number;
}

export function parseCollectionSort(value?: string): CollectionSort {
  if (value === 'created' || value === 'title' || value === 'updated') {
    return value;
  }

  return 'updated';
}

export function parseCollectionPage(value?: string): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
}

export async function getCollectionPageData({
  slug,
  tag,
  sort,
  page,
}: CollectionPageOptions) {
  const collection = await db.collection.findUnique({
    where: { slug },
    include: {
      _count: {
        select: {
          entries: true,
        },
      },
    },
  });

  if (!collection) {
    return null;
  }

  const entryWhere: Prisma.EntryWhereInput = {
    collectionId: collection.id,
    ...(tag ? { tags: { has: tag } } : {}),
  };

  const orderBy: Prisma.EntryOrderByWithRelationInput =
    sort === 'title'
      ? { title: 'asc' }
      : sort === 'created'
        ? { createdAt: 'desc' }
        : { updatedAt: 'desc' };

  const [entries, filteredCount, tagRows] = await Promise.all([
    db.entry.findMany({
      where: entryWhere,
      orderBy,
      skip: (page - 1) * COLLECTION_PAGE_SIZE,
      take: COLLECTION_PAGE_SIZE,
      include: {
        _count: {
          select: {
            sources: true,
          },
        },
      },
    }),
    db.entry.count({ where: entryWhere }),
    db.entry.findMany({
      where: { collectionId: collection.id },
      select: { tags: true },
    }),
  ]);

  // Build the tag universe, then surface only the most-used few. With thousands
  // of one-off tags, showing them all is a wall of pills — frequency picks the
  // ones actually worth filtering by.
  const frequency = new Map<string, number>();
  for (const row of tagRows) {
    for (const entryTag of row.tags) {
      frequency.set(entryTag, (frequency.get(entryTag) ?? 0) + 1);
    }
  }

  const tags = Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_VISIBLE_TAGS)
    .map(([entryTag]) => entryTag);

  // Keep an active tag filter visible even if it sits outside the most-used set.
  if (tag && !tags.includes(tag)) {
    tags.unshift(tag);
  }

  return {
    collection,
    entries,
    tags,
    totalTagCount: frequency.size,
    filteredCount,
    page,
    pageSize: COLLECTION_PAGE_SIZE,
  };
}

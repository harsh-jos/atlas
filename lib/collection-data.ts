import { Prisma } from '@prisma/client';
import db from '@/lib/db';

export type CollectionSort = 'updated' | 'created' | 'title';

export interface CollectionPageOptions {
  slug: string;
  tag?: string;
  sort: CollectionSort;
}

export function parseCollectionSort(value?: string): CollectionSort {
  if (value === 'created' || value === 'title' || value === 'updated') {
    return value;
  }

  return 'updated';
}

export async function getCollectionPageData({
  slug,
  tag,
  sort,
}: CollectionPageOptions) {
  const entryWhere: Prisma.EntryWhereInput = {
    ...(tag ? { tags: { has: tag } } : {}),
  };

  const orderBy: Prisma.EntryOrderByWithRelationInput =
    sort === 'title'
      ? { title: 'asc' }
      : sort === 'created'
        ? { createdAt: 'desc' }
        : { updatedAt: 'desc' };

  const collection = await db.collection.findUnique({
    where: { slug },
    include: {
      entries: {
        where: entryWhere,
        orderBy,
        include: {
          _count: {
            select: {
              sources: true,
            },
          },
        },
      },
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

  const allEntries = await db.entry.findMany({
    where: {
      collectionId: collection.id,
    },
    select: {
      tags: true,
    },
  });

  const tags = Array.from(new Set(allEntries.flatMap((entry) => entry.tags))).sort((a, b) =>
    a.localeCompare(b)
  );

  return {
    collection,
    tags,
  };
}

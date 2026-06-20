import db from '@/lib/db';

export async function getEntryArtifact(slug: string) {
  return db.entry.findUnique({
    where: { slug },
    include: {
      collection: true,
      sources: {
        orderBy: {
          createdAt: 'asc',
        },
      },
      relationsFrom: {
        orderBy: {
          createdAt: 'asc',
        },
        include: {
          to: {
            include: {
              collection: true,
            },
          },
        },
      },
      // Incoming relations — rendered with inverse labels (e.g. "Used by").
      // SEE_ALSO is filtered out in the UI since both directions are stored.
      relationsTo: {
        orderBy: {
          createdAt: 'asc',
        },
        include: {
          from: {
            include: {
              collection: true,
            },
          },
        },
      },
      _count: {
        select: {
          sources: true,
          relationsFrom: true,
          relationsTo: true,
        },
      },
    },
  });
}

export type EntryArtifactData = NonNullable<Awaited<ReturnType<typeof getEntryArtifact>>>;

export async function getEntryEditorCollections() {
  return db.collection.findMany({
    orderBy: {
      name: 'asc',
    },
    select: {
      id: true,
      name: true,
      color: true,
    },
  });
}

export type EntryEditorCollection = Awaited<ReturnType<typeof getEntryEditorCollections>>[number];

/** A relation-target candidate as the editor's picker consumes it (display-ready). */
export interface RelationCandidate {
  id: string;
  title: string;
  collectionColor: string | null;
}

/** Rows returned per relation-target search — keeps the picker dropdown short. */
export const RELATION_CANDIDATE_LIMIT = 20;

/**
 * Candidate entries for a relation target, matched by a title query. Bounded by
 * {@link RELATION_CANDIDATE_LIMIT} so the editor never loads the whole library —
 * an empty query just returns the first page alphabetically.
 */
export async function searchEntryRelationCandidates(
  query: string,
  excludeId: string,
  limit: number = RELATION_CANDIDATE_LIMIT
) {
  const trimmed = query.trim();

  return db.entry.findMany({
    where: {
      id: { not: excludeId },
      ...(trimmed ? { title: { contains: trimmed, mode: 'insensitive' } } : {}),
    },
    orderBy: {
      title: 'asc',
    },
    take: limit,
    select: {
      id: true,
      title: true,
      collection: {
        select: {
          name: true,
          color: true,
        },
      },
    },
  });
}

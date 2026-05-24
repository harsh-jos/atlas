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
      _count: {
        select: {
          sources: true,
          relationsFrom: true,
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

export async function getEntryRelationCandidates(entryId: string) {
  return db.entry.findMany({
    where: {
      id: {
        not: entryId,
      },
    },
    orderBy: {
      title: 'asc',
    },
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

export type EntryRelationCandidate = Awaited<ReturnType<typeof getEntryRelationCandidates>>[number];

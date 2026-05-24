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

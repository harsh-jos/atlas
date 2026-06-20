import { RelationType } from '@prisma/client';
import db from '@/lib/db';
import { cleanTitle } from '@/lib/utils';

export interface KnowledgeGraphNode {
  id: string;
  title: string;
  slug: string;
  collectionName: string;
  collectionColor: string;
}

export interface KnowledgeGraphLink {
  source: string;
  target: string;
  relationType: RelationType;
  note: string | null;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeGraphNode[];
  links: KnowledgeGraphLink[];
}

export async function getKnowledgeGraphData(): Promise<KnowledgeGraphData> {
  const entries = await db.entry.findMany({
    orderBy: {
      title: 'asc',
    },
    select: {
      id: true,
      title: true,
      slug: true,
      collection: {
        select: {
          name: true,
          color: true,
        },
      },
      relationsFrom: {
        select: {
          toId: true,
          relationType: true,
          note: true,
        },
      },
    },
  });

  return {
    nodes: entries.map((entry) => ({
      id: entry.id,
      title: cleanTitle(entry.title),
      slug: entry.slug,
      collectionName: entry.collection.name,
      collectionColor: entry.collection.color || '#888888',
    })),
    links: entries.flatMap((entry) =>
      entry.relationsFrom.map((relation) => ({
        source: entry.id,
        target: relation.toId,
        relationType: relation.relationType,
        note: relation.note,
      }))
    ),
  };
}

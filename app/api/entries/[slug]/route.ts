import { EntryStatus, RelationType, SourceType } from '@prisma/client';
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { createUniqueEntrySlug } from '@/lib/entry-slugs';

interface EntryRouteContext {
  params: Promise<{
    slug: string;
  }>;
}

interface UpdateEntryPayload {
  title?: unknown;
  summary?: unknown;
  body?: unknown;
  originalBody?: unknown;
  tags?: unknown;
  status?: unknown;
  collectionId?: unknown;
  sources?: unknown;
  relations?: unknown;
}

interface SourceInput {
  sourceType: SourceType;
  title: string;
  author?: string;
  url?: string;
  ref?: string;
}

interface RelationInput {
  toId: string;
  relationType: RelationType;
  note?: string;
}

export async function PATCH(request: Request, context: EntryRouteContext) {
  const { slug } = await context.params;
  const payload = (await request.json()) as UpdateEntryPayload;

  const existingEntry = await db.entry.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
    },
  });

  if (!existingEntry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

  const title = readString(payload.title)?.trim() || existingEntry.title;
  const nextSlug =
    title !== existingEntry.title
      ? await createUniqueEntrySlug(title, existingEntry.slug)
      : existingEntry.slug;

  const collectionId = readString(payload.collectionId);

  if (collectionId) {
    const collection = await db.collection.findUnique({
      where: { id: collectionId },
      select: { id: true },
    });

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 400 });
    }
  }

  const sources = readSources(payload.sources);
  const relations = dedupeRelations(readRelations(payload.relations, existingEntry.id));

  const entry = await db.$transaction(async (tx) => {
    const updatedEntry = await tx.entry.update({
      where: { id: existingEntry.id },
      data: {
        title,
        slug: nextSlug,
        summary: readString(payload.summary),
        body: readString(payload.body),
        originalBody: readString(payload.originalBody),
        tags: readStringArray(payload.tags),
        status: readEntryStatus(payload.status),
        ...(collectionId ? { collectionId } : {}),
      },
      include: {
        collection: true,
      },
    });

    await tx.source.deleteMany({
      where: {
        entryId: existingEntry.id,
      },
    });

    if (sources.length > 0) {
      await tx.source.createMany({
        data: sources.map((source) => ({
          entryId: existingEntry.id,
          ...source,
        })),
      });
    }

    await tx.relation.deleteMany({
      where: {
        OR: [
          { fromId: existingEntry.id },
          {
            toId: existingEntry.id,
            relationType: RelationType.SEE_ALSO,
          },
        ],
      },
    });

    const relationRows = relations.flatMap((relation) => {
      const outgoingRelation = {
        fromId: existingEntry.id,
        toId: relation.toId,
        relationType: relation.relationType,
        note: relation.note,
      };

      if (relation.relationType !== RelationType.SEE_ALSO) {
        return [outgoingRelation];
      }

      return [
        outgoingRelation,
        {
          fromId: relation.toId,
          toId: existingEntry.id,
          relationType: relation.relationType,
          note: relation.note,
        },
      ];
    });

    if (relationRows.length > 0) {
      await tx.relation.createMany({
        data: relationRows,
        skipDuplicates: true,
      });
    }

    return updatedEntry;
  });

  return NextResponse.json(entry);
}

export async function DELETE(_request: Request, context: EntryRouteContext) {
  const { slug } = await context.params;

  const existing = await db.entry.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

  // Sources and relations cascade on delete (see schema).
  await db.entry.delete({ where: { id: existing.id } });

  return NextResponse.json({ ok: true });
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string')))
    .map((item) => item.trim())
    .filter(Boolean);
}

function readEntryStatus(value: unknown) {
  return value === EntryStatus.PUBLISHED ? EntryStatus.PUBLISHED : EntryStatus.DRAFT;
}

function readSources(value: unknown): SourceInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): SourceInput | null => {
      if (!isRecord(item)) {
        return null;
      }

      const title = readString(item.title)?.trim();
      const sourceType = readSourceType(item.sourceType);

      if (!title || !sourceType) {
        return null;
      }

      return {
        sourceType,
        title,
        author: blankToUndefined(readString(item.author)),
        url: blankToUndefined(readString(item.url)),
        ref: blankToUndefined(readString(item.ref)),
      };
    })
    .filter((source): source is SourceInput => source !== null);
}

function readRelations(value: unknown, entryId: string): RelationInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): RelationInput | null => {
      if (!isRecord(item)) {
        return null;
      }

      const toId = readString(item.toId)?.trim();
      const relationType = readRelationType(item.relationType);

      if (!toId || toId === entryId || !relationType) {
        return null;
      }

      return {
        toId,
        relationType,
        note: blankToUndefined(readString(item.note)),
      };
    })
    .filter((relation): relation is RelationInput => relation !== null);
}

function readSourceType(value: unknown) {
  return Object.values(SourceType).find((sourceType) => sourceType === value);
}

function readRelationType(value: unknown) {
  return Object.values(RelationType).find((relationType) => relationType === value);
}

function dedupeRelations(relations: RelationInput[]) {
  const seen = new Set<string>();

  return relations.filter((relation) => {
    const key = `${relation.toId}:${relation.relationType}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function blankToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

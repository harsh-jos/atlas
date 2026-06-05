import { RelationType } from '@prisma/client';
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { createUniqueEntrySlug } from '@/lib/entry-slugs';
import {
  buildRelationRows,
  dedupeRelations,
  readEntryStatus,
  readMetadata,
  readRelations,
  readSources,
  readString,
  readStringArray,
  type EntryWritePayload,
} from '@/lib/entry-input';

interface EntryRouteContext {
  params: Promise<{
    slug: string;
  }>;
}

export async function PATCH(request: Request, context: EntryRouteContext) {
  const { slug } = await context.params;
  const payload = (await request.json()) as EntryWritePayload;

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
  const metadata = readMetadata(payload.metadata);

  const entry = await db.$transaction(async (tx) => {
    const updatedEntry = await tx.entry.update({
      where: { id: existingEntry.id },
      data: {
        title,
        slug: nextSlug,
        summary: readString(payload.summary),
        body: readString(payload.body),
        tags: readStringArray(payload.tags),
        status: readEntryStatus(payload.status),
        ...(metadata !== undefined ? { metadata } : {}),
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

    const relationRows = buildRelationRows(existingEntry.id, relations);

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

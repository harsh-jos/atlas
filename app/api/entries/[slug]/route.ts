import { EntryStatus } from '@prisma/client';
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
  tags?: unknown;
  status?: unknown;
  collectionId?: unknown;
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

  const entry = await db.entry.update({
    where: { id: existingEntry.id },
    data: {
      title,
      slug: nextSlug,
      summary: readString(payload.summary),
      body: readString(payload.body),
      tags: readStringArray(payload.tags),
      status: readEntryStatus(payload.status),
      ...(collectionId ? { collectionId } : {}),
    },
    include: {
      collection: true,
    },
  });

  return NextResponse.json(entry);
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

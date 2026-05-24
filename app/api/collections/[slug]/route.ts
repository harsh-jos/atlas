import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { createUniqueCollectionSlug } from '@/lib/collection-slugs';

interface CollectionRouteContext {
  params: Promise<{ slug: string }>;
}

interface UpdateCollectionPayload {
  name?: unknown;
  description?: unknown;
  color?: unknown;
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function blankToNull(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function PATCH(request: Request, context: CollectionRouteContext) {
  const { slug } = await context.params;
  const payload = (await request.json()) as UpdateCollectionPayload;

  const existing = await db.collection.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
  }

  const name = readString(payload.name)?.trim() || existing.name;
  const nextSlug =
    name !== existing.name
      ? await createUniqueCollectionSlug(name, existing.slug)
      : existing.slug;

  const collection = await db.collection.update({
    where: { id: existing.id },
    data: {
      name,
      slug: nextSlug,
      ...(payload.description !== undefined
        ? { description: blankToNull(readString(payload.description)) }
        : {}),
      ...(payload.color !== undefined ? { color: blankToNull(readString(payload.color)) } : {}),
    },
  });

  return NextResponse.json(collection);
}

export async function DELETE(_request: Request, context: CollectionRouteContext) {
  const { slug } = await context.params;

  const existing = await db.collection.findUnique({
    where: { slug },
    select: { id: true, _count: { select: { entries: true } } },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
  }

  // Entries reference a collection with onDelete: Restrict — don't orphan them.
  if (existing._count.entries > 0) {
    return NextResponse.json(
      { error: 'Move or delete this collection’s entries before deleting it.' },
      { status: 409 }
    );
  }

  await db.collection.delete({ where: { id: existing.id } });

  return NextResponse.json({ ok: true });
}

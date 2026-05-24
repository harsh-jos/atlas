import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { createUniqueCollectionSlug } from '@/lib/collection-slugs';

interface CreateCollectionPayload {
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

export async function POST(request: Request) {
  const payload = (await request.json()) as CreateCollectionPayload;
  const name = readString(payload.name)?.trim();

  if (!name) {
    return NextResponse.json({ error: 'A collection name is required.' }, { status: 400 });
  }

  const slug = await createUniqueCollectionSlug(name);

  const collection = await db.collection.create({
    data: {
      name,
      slug,
      description: blankToNull(readString(payload.description)),
      color: blankToNull(readString(payload.color)),
    },
  });

  return NextResponse.json(collection, { status: 201 });
}

export async function GET() {
  const collections = await db.collection.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { entries: true } } },
  });

  return NextResponse.json(collections);
}

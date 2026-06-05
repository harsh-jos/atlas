import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { createUniqueEntrySlug } from '@/lib/entry-slugs';
import {
  buildRelationRows,
  dedupeRelations,
  isRecord,
  readEntryStatus,
  readMetadata,
  readRelations,
  readSources,
  readString,
  readStringArray,
  type EntryWritePayload,
} from '@/lib/entry-input';

export async function POST(request: Request) {
  try {
    const payloadResult = await readOptionalPayload(request);
    if (payloadResult.error) {
      return NextResponse.json({ error: payloadResult.error }, { status: 400 });
    }

    const payload = payloadResult.payload;
    const hasPayload = isRecord(payload);

    let defaultCollection = await db.collection.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    if (!defaultCollection) {
      defaultCollection = await db.collection.create({
        data: {
          name: 'General',
          slug: 'general',
          description: 'Default collection for uncategorized entries.',
          color: '#888888',
        },
      });
    }

    const collectionId = hasPayload
      ? readString(payload.collectionId) || defaultCollection.id
      : defaultCollection.id;

    if (collectionId !== defaultCollection.id) {
      const collection = await db.collection.findUnique({
        where: { id: collectionId },
        select: { id: true },
      });

      if (!collection) {
        return NextResponse.json({ error: 'Collection not found' }, { status: 400 });
      }
    }

    const title = hasPayload ? readString(payload.title)?.trim() || 'Untitled' : 'Untitled';
    const slug = await createUniqueEntrySlug(title);
    const sources = hasPayload ? readSources(payload.sources) : [];
    const metadata = hasPayload ? readMetadata(payload.metadata) : undefined;

    const entry = await db.$transaction(async (tx) => {
      const createdEntry = await tx.entry.create({
        data: {
          title,
          slug,
          summary: hasPayload ? readString(payload.summary) : '',
          body: hasPayload ? readString(payload.body) : '',
          tags: hasPayload ? readStringArray(payload.tags) : [],
          status: hasPayload ? readEntryStatus(payload.status) : 'DRAFT',
          collectionId,
          ...(metadata !== undefined ? { metadata } : {}),
        },
      });

      if (sources.length > 0) {
        await tx.source.createMany({
          data: sources.map((source) => ({
            entryId: createdEntry.id,
            ...source,
          })),
        });
      }

      if (hasPayload) {
        const relations = dedupeRelations(readRelations(payload.relations, createdEntry.id));
        const relationRows = buildRelationRows(createdEntry.id, relations);

        if (relationRows.length > 0) {
          await tx.relation.createMany({
            data: relationRows,
            skipDuplicates: true,
          });
        }
      }

      return createdEntry;
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error('Error creating new entry:', error);
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 });
  }
}

// Optional GET handler to list entries if needed later
export async function GET() {
  try {
    const entries = await db.entry.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        collection: true,
      },
    });
    return NextResponse.json(entries);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
  }
}

async function readOptionalPayload(request: Request): Promise<{
  payload?: EntryWritePayload;
  error?: string;
}> {
  const contentType = request.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    return {};
  }

  try {
    const payload = (await request.json()) as unknown;
    return isRecord(payload) ? { payload } : { error: 'Request body must be a JSON object.' };
  } catch {
    return { error: 'Request body must be valid JSON.' };
  }
}

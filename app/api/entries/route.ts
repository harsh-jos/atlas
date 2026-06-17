import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { createUniqueEntrySlug } from '@/lib/entry-slugs';

export async function POST() {
  try {
    // 1. Get or create a default collection if none exists
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

    // 2. Determine a unique title and slug for the new entry
    const title = 'Untitled';
    const slug = await createUniqueEntrySlug(title);

    // 3. Create the blank entry
    const entry = await db.entry.create({
      data: {
        title,
        slug,
        summary: '',
        body: '',
        originalBody: '',
        tags: [],
        status: 'DRAFT',
        collectionId: defaultCollection.id,
      },
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

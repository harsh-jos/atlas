import { NextResponse } from 'next/server';
import db from '@/lib/db';

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
    let title = 'Untitled';
    let slug = 'untitled';
    let count = 0;

    while (true) {
      const currentSlug = count === 0 ? slug : `${slug}-${count}`;
      const currentTitle = count === 0 ? title : `${title} ${count}`;

      const existingEntry = await db.entry.findUnique({
        where: { slug: currentSlug },
      });

      if (!existingEntry) {
        slug = currentSlug;
        title = currentTitle;
        break;
      }
      count++;
    }

    // 3. Create the blank entry
    const entry = await db.entry.create({
      data: {
        title,
        slug,
        summary: '',
        body: '',
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

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { createUniqueNoteSlug } from '@/lib/note-slugs';

export async function POST() {
  try {
    const title = 'Untitled note';
    const slug = await createUniqueNoteSlug(title);

    const note = await db.note.create({
      data: {
        title,
        slug,
        body: '',
        knowledgeLinksEnabled: true,
      },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error('Error creating note:', error);
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const notes = await db.note.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: {
            links: true,
          },
        },
      },
    });

    return NextResponse.json(notes);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

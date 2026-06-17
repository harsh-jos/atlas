import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { createUniqueNoteSlug } from '@/lib/note-slugs';

interface NoteRouteContext {
  params: Promise<{ slug: string }>;
}

interface UpdateNotePayload {
  title?: unknown;
  body?: unknown;
  knowledgeLinksEnabled?: unknown;
  linkedEntryIds?: unknown;
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function readEntryIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((id): id is string => typeof id === 'string'))).map((id) =>
    id.trim()
  ).filter(Boolean);
}

export async function PATCH(request: Request, context: NoteRouteContext) {
  const { slug } = await context.params;
  const payload = (await request.json()) as UpdateNotePayload;

  const existing = await db.note.findUnique({
    where: { slug },
    select: { id: true, slug: true, title: true, knowledgeLinksEnabled: true },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }

  const title = readString(payload.title)?.trim() || existing.title;
  const nextSlug =
    title !== existing.title ? await createUniqueNoteSlug(title, existing.slug) : existing.slug;
  const knowledgeLinksEnabled = readBoolean(
    payload.knowledgeLinksEnabled,
    existing.knowledgeLinksEnabled
  );
  const linkedEntryIds = readEntryIds(payload.linkedEntryIds);

  const updated = await db.$transaction(async (tx) => {
    const note = await tx.note.update({
      where: { id: existing.id },
      data: {
        title,
        slug: nextSlug,
        body: readString(payload.body) ?? '',
        knowledgeLinksEnabled,
      },
    });

    await tx.noteLink.deleteMany({ where: { noteId: existing.id } });

    if (knowledgeLinksEnabled && linkedEntryIds.length > 0) {
      const validEntries = await tx.entry.findMany({
        where: {
          id: {
            in: linkedEntryIds,
          },
        },
        select: { id: true },
      });

      if (validEntries.length > 0) {
        await tx.noteLink.createMany({
          data: validEntries.map((entry) => ({
            noteId: existing.id,
            entryId: entry.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    return note;
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, context: NoteRouteContext) {
  const { slug } = await context.params;

  const existing = await db.note.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }

  await db.note.delete({ where: { id: existing.id } });

  return NextResponse.json({ ok: true });
}

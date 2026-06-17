import db from '@/lib/db';

export async function getNotesLibraryData() {
  const [notes, totalNotes] = await Promise.all([
    db.note.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: {
            links: true,
          },
        },
      },
    }),
    db.note.count(),
  ]);

  return { notes, totalNotes };
}

export async function getNoteBySlug(slug: string) {
  return db.note.findUnique({
    where: { slug },
    include: {
      links: {
        orderBy: { createdAt: 'asc' },
        include: {
          entry: {
            include: {
              collection: true,
            },
          },
        },
      },
      _count: {
        select: {
          links: true,
        },
      },
    },
  });
}

export async function getNoteLinkCandidates(noteId: string) {
  const existingLinks = await db.noteLink.findMany({
    where: { noteId },
    select: { entryId: true },
  });

  return db.entry.findMany({
    where: {
      id: {
        notIn: existingLinks.map((link) => link.entryId),
      },
    },
    orderBy: { title: 'asc' },
    select: {
      id: true,
      title: true,
      slug: true,
      collection: {
        select: {
          name: true,
          color: true,
        },
      },
    },
  });
}

export async function getNoteEditorCandidates() {
  return db.entry.findMany({
    orderBy: { title: 'asc' },
    select: {
      id: true,
      title: true,
      slug: true,
      collection: {
        select: {
          name: true,
          color: true,
        },
      },
    },
  });
}

export type NoteWithLinks = NonNullable<Awaited<ReturnType<typeof getNoteBySlug>>>;
export type NoteLinkCandidate = Awaited<ReturnType<typeof getNoteLinkCandidates>>[number];
export type NoteEditorCandidate = Awaited<ReturnType<typeof getNoteEditorCandidates>>[number];

import { BookOpenText } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { NoteCard } from '@/components/note/NoteCard';
import { CreateNoteButton } from '@/components/note/CreateNoteButton';
import { getNotesLibraryData } from '@/lib/note-data';

export const dynamic = 'force-dynamic';

export default async function NotesPage() {
  const { notes, totalNotes } = await getNotesLibraryData();

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[34px] font-medium leading-none tracking-[-0.025em] text-ink">
            Personal notes
          </h1>
          <p className="mt-3 text-[15px] text-muted">
            Private thinking space, separate from your knowledge base.
          </p>
        </div>
        <CreateNoteButton size="sm" className="h-9 rounded-lg px-3.5 text-[13px]" />
      </header>

      <div className="mb-6 rounded-2xl border-thin bg-surface px-5 py-4">
        <p className="text-[12px] text-faint">
          {totalNotes} {totalNotes === 1 ? 'note' : 'notes'} · link-only references to knowledge base
        </p>
      </div>

      {notes.length > 0 ? (
        <div className="divide-y divide-[var(--hairline)] overflow-hidden rounded-2xl border-thin bg-surface">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              title={note.title}
              slug={note.slug}
              body={note.body}
              linkCount={note._count.links}
              updatedAt={note.updatedAt}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<BookOpenText className="h-4 w-4" />}
          title="No notes yet"
          description="Create your first personal note. Notes stay separate from the knowledge base."
        />
      )}
    </div>
  );
}

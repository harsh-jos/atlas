import { notFound } from 'next/navigation';
import { NoteArtifact } from '@/components/note/NoteArtifact';
import { NoteInlineEditor } from '@/components/note/NoteInlineEditor';
import { getNoteBySlug, getNoteEditorCandidates } from '@/lib/note-data';

export const dynamic = 'force-dynamic';

interface NotePageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ edit?: string }>;
}

export default async function NotePage({ params, searchParams }: NotePageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const note = await getNoteBySlug(slug);

  if (!note) {
    notFound();
  }

  if (query.edit === 'true') {
    const candidates = await getNoteEditorCandidates();
    return <NoteInlineEditor note={note} candidates={candidates} />;
  }

  return <NoteArtifact note={note} />;
}

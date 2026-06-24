import { notFound } from 'next/navigation';
import { EntryArtifact } from '@/components/entry/EntryArtifact';
import { EntryInlineEditor } from '@/components/entry/EntryInlineEditor';
import { getEntryArtifact, getEntryEditorCollections } from '@/lib/entry-data';

export const dynamic = 'force-dynamic';

interface EntryPageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    edit?: string;
  }>;
}

export default async function EntryPage({ params, searchParams }: EntryPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const isEdit = query.edit === 'true';

  // Fetch the entry and (in edit mode) the editor's collection list together —
  // they're independent, so there's no reason to pay two sequential round-trips.
  const [entry, collections] = await Promise.all([
    getEntryArtifact(slug),
    isEdit ? getEntryEditorCollections() : Promise.resolve(null),
  ]);

  if (!entry) {
    notFound();
  }

  if (isEdit) {
    return <EntryInlineEditor entry={entry} collections={collections!} />;
  }

  return <EntryArtifact entry={entry} />;
}

import { notFound } from 'next/navigation';
import { EntryArtifact } from '@/components/entry/EntryArtifact';
import { EntryInlineEditor } from '@/components/entry/EntryInlineEditor';
import {
  getEntryArtifact,
  getEntryEditorCollections,
  getEntryRelationCandidates,
} from '@/lib/entry-data';

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
  const entry = await getEntryArtifact(slug);

  if (!entry) {
    notFound();
  }

  if (query.edit === 'true') {
    const [collections, relationCandidates] = await Promise.all([
      getEntryEditorCollections(),
      getEntryRelationCandidates(entry.id),
    ]);

    return (
      <EntryInlineEditor
        entry={entry}
        collections={collections}
        relationCandidates={relationCandidates}
      />
    );
  }

  return <EntryArtifact entry={entry} />;
}

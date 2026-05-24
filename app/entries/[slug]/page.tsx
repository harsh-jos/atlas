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
  const [entry, collections] = await Promise.all([
    getEntryArtifact(slug),
    getEntryEditorCollections(),
  ]);

  if (!entry) {
    notFound();
  }

  if (query.edit === 'true') {
    return <EntryInlineEditor entry={entry} collections={collections} />;
  }

  return <EntryArtifact entry={entry} />;
}

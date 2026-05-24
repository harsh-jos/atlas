import { notFound } from 'next/navigation';
import { EntryArtifact } from '@/components/entry/EntryArtifact';
import { getEntryArtifact } from '@/lib/entry-data';

export const dynamic = 'force-dynamic';

interface EntryPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function EntryPage({ params }: EntryPageProps) {
  const { slug } = await params;
  const entry = await getEntryArtifact(slug);

  if (!entry) {
    notFound();
  }

  return <EntryArtifact entry={entry} />;
}

import { notFound } from 'next/navigation';
import { EntryArtifact } from '@/components/entry/EntryArtifact';
import { EntryInlineEditor } from '@/components/entry/EntryInlineEditor';
import { apiGet, apiGetOrNull } from '@/lib/api';
import type { ArtifactDetail, ConceptSummary } from '@/lib/api-types';

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

  // The entry and (in edit mode) the collection picker's options are independent,
  // so there's no reason to pay two sequential round-trips.
  const [artifact, concepts] = await Promise.all([
    apiGetOrNull<ArtifactDetail>(`/artifacts/${encodeURIComponent(slug)}`),
    isEdit ? apiGet<ConceptSummary[]>('/concepts') : Promise.resolve(null),
  ]);

  if (!artifact) {
    notFound();
  }

  return concepts ? (
    <EntryInlineEditor artifact={artifact} concepts={concepts} />
  ) : (
    <EntryArtifact artifact={artifact} />
  );
}

import { notFound } from 'next/navigation';
import { EntryArtifact } from '@/components/entry/EntryArtifact';
import { apiGetOrNull } from '@/lib/api';
import type { ArtifactDetail } from '@/lib/api-types';

export const dynamic = 'force-dynamic';

interface EntryPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function EntryPage({ params }: EntryPageProps) {
  const { slug } = await params;
  const artifact = await apiGetOrNull<ArtifactDetail>(`/artifacts/${encodeURIComponent(slug)}`);

  if (!artifact) {
    notFound();
  }

  return <EntryArtifact artifact={artifact} />;
}

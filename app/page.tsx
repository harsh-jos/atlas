import { apiGet } from '@/lib/api';
import type { ConceptSummary } from '@/lib/api-types';
import { CollectionShelf } from '@/components/collection/CollectionShelf';
import { NewCollectionCard } from '@/components/collection/NewCollectionCard';
import { PageContainer, PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Library } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const concepts = await apiGet<ConceptSummary[]>('/concepts');

  return (
    <PageContainer>
      <PageHeader title="Library" description="Everything you’re learning, on one shelf." />

      {concepts.length === 0 && (
        <EmptyState
          icon={<Library className="h-4 w-4" />}
          title="Your library is empty"
          description="Start a collection below to begin gathering what you learn."
        />
      )}

      <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
        {concepts.map((concept) => (
          <CollectionShelf
            key={concept.id}
            name={concept.name}
            slug={concept.slug}
            description={concept.description}
            color={concept.color}
            recentEntryTitle={concept.recentArtifactTitle}
          />
        ))}
        <NewCollectionCard />
      </div>
    </PageContainer>
  );
}

import Link from 'next/link';
import { apiGet } from '@/lib/api';
import type { ConceptSummary } from '@/lib/api-types';
import { CollectionShelf } from '@/components/collection/CollectionShelf';
import { PageContainer, PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Library } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HomePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const query = await searchParams;
  const page = Math.max(1, Math.min(10000, Math.floor(Number(query.page) || 1)));
  const rows = await apiGet<ConceptSummary[]>(`/concepts?limit=101&offset=${(page - 1) * 100}`);
  const concepts = rows.slice(0, 100);

  return (
    <PageContainer>
      <PageHeader title="Library" description="Everything you’re learning, on one shelf." />

      {concepts.length === 0 && (
        <EmptyState
          icon={<Library className="h-4 w-4" />}
          title="Your library is empty"
          description="Ask Atlas about something you’re curious about — what you choose to keep lands here."
          action={{ label: 'Start a session', href: '/chat' }}
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
      </div>
      <nav className="mt-6 flex gap-4 text-sm" aria-label="Library pages">
        {page > 1 && <Link href={`/?page=${page - 1}`}>Previous</Link>}
        {rows.length > 100 && <Link href={`/?page=${page + 1}`}>Next</Link>}
      </nav>
    </PageContainer>
  );
}

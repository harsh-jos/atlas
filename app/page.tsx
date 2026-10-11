import Link from 'next/link';
import { ArrowUpRight, Sparkles, Network, Library } from 'lucide-react';
import { apiGet } from '@/lib/api';
import type { ConceptSummary } from '@/lib/api-types';
import { LibraryBrowser } from '@/components/collection/LibraryBrowser';
import { PageContainer, PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/shadcn/button';
export const dynamic = 'force-dynamic';
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const query = await searchParams;
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(query.page) || 1)),
  );
  const rows = await apiGet<ConceptSummary[]>(
    `/concepts?limit=101&offset=${(page - 1) * 100}`,
  );
  const concepts = rows.slice(0, 100);
  return (
    <PageContainer>
      <PageHeader
        title="Your library"
        description="A home for the ideas you want to come back to."
        actions={
          <Button asChild className="rounded-lg">
            <Link href="/chat">
              <Sparkles className="size-4" />
              Explore something new
            </Link>
          </Button>
        }
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-line/70 bg-accent-soft/50 px-4 py-3">
        <div>
          <h2 className="text-sm font-medium tracking-tight">
            Big ideas start with a good question.
          </h2>
          <p className="mt-1 text-xs text-muted">
            Follow a thread and keep the explanations that click.
          </p>
        </div>
        <Link
          href="/graph"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-accent"
        >
          <Network className="size-3.5" />
          See the bigger picture
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      {concepts.length ? (
        <LibraryBrowser
          concepts={concepts}
          paginated={page > 1 || rows.length > 100}
        />
      ) : (
        <EmptyState
          icon={<Library className="size-5" />}
          title="Your next idea belongs here"
          description="Explore a question with Atlas. Concepts and explanations you keep will make this space your own."
          action={{ label: 'Ask your first question', href: '/chat' }}
        />
      )}
      {(page > 1 || rows.length > 100) && (
        <nav
          className="mt-8 flex items-center justify-between text-sm"
          aria-label="Library pages"
        >
          <span className="text-xs text-muted">Page {page}</span>
          <div className="flex gap-3">
            {page > 1 && (
              <Button variant="outline" asChild>
                <Link href={`/?page=${page - 1}`}>Previous</Link>
              </Button>
            )}
            {rows.length > 100 && (
              <Button variant="outline" asChild>
                <Link href={`/?page=${page + 1}`}>Next</Link>
              </Button>
            )}
          </div>
        </nav>
      )}
    </PageContainer>
  );
}

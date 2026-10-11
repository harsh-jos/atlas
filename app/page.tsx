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
      <div className="mb-7 grid gap-4 sm:mb-10 lg:grid-cols-[1.6fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl border border-accent-line/70 bg-[#f0f9fe] px-5 py-5 sm:px-7 sm:py-7">
          <span className="mb-4 hidden items-center sm:inline-flex gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
            <Sparkles className="size-3.5" />A little curiosity goes a long way
          </span>
          <h2 className="max-w-sm text-xl font-medium sm:text-[23px] leading-snug tracking-[-0.03em]">
            Big ideas start with
            <br />a good question.
          </h2>
          <p className="mt-3 hidden max-w-sm text-xs leading-6 text-muted sm:block">
            Follow a thread, untangle a concept, and keep the explanations that
            click.
          </p>
          <Link
            href="/chat"
            className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-accent"
          >
            Start a conversation <ArrowUpRight className="size-4" />
          </Link>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-12 -top-8 hidden size-64 rounded-full border-[28px] border-sky/10 sm:block"
          >
            <div className="m-6 size-36 rounded-full border-[20px] border-sky/15" />
          </div>
        </div>
        <Link
          href="/graph"
          className="group hidden flex-col justify-between rounded-2xl sm:flex border bg-canvas/60 px-6 py-7 transition-colors hover:border-accent-line"
        >
          <div className="flex items-start justify-between">
            <Network className="size-6 text-accent" />
            <ArrowUpRight className="size-4 text-faint group-hover:text-accent" />
          </div>
          <div className="mt-7">
            <h2 className="text-base font-semibold tracking-tight">
              See the bigger picture
            </h2>
            <p className="mt-2 max-w-xs text-xs leading-6 text-muted">
              Discover how the concepts you’ve explored connect to each other.
            </p>
          </div>
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

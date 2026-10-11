import Link from 'next/link';
import { KnowledgeGraphPanel } from '@/components/graph/KnowledgeGraphPanel';
import { apiGet } from '@/lib/api';
import type { Graph } from '@/lib/api-types';
import { cleanTitle } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const query = await searchParams;
  const page = Math.max(1, Math.min(5000, Math.floor(Number(query.page) || 1)));
  const { nodes, links, hasMore } = await apiGet<Graph>(
    `/graph?offset=${(page - 1) * 200}`,
  );
  const graphData: Graph = {
    nodes: nodes.map((node) => ({ ...node, title: cleanTitle(node.title) })),
    links,
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="min-h-0 flex-1">
        <KnowledgeGraphPanel key={page} data={graphData} />
      </div>
      {(page > 1 || hasMore) && (
        <nav
          className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t bg-surface px-4 py-2 text-xs"
          aria-label="Graph pages"
        >
          <span>Page {page} · connections within this page</span>
          {page > 1 && <Link href={`/graph?page=${page - 1}`}>Previous</Link>}
          {hasMore && <Link href={`/graph?page=${page + 1}`}>Next</Link>}
        </nav>
      )}
    </div>
  );
}

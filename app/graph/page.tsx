import Link from 'next/link';
import { KnowledgeGraphPanel } from '@/components/graph/KnowledgeGraphPanel';
import { apiGet } from '@/lib/api';
import type { Graph } from '@/lib/api-types';
import { cleanTitle } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function GraphPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const query = await searchParams;
  const page = Math.max(1, Math.min(5000, Math.floor(Number(query.page) || 1)));
  const { nodes, links, hasMore } = await apiGet<Graph>(`/graph?offset=${(page - 1) * 200}`);
  const graphData: Graph = {
    nodes: nodes.map((node) => ({ ...node, title: cleanTitle(node.title) })),
    links,
  };

  return (
    <div className="relative h-full w-full">
      <KnowledgeGraphPanel data={graphData} />
      {(page > 1 || hasMore) && <nav className="absolute bottom-4 left-4 flex gap-4 rounded-lg bg-surface p-3 text-sm" aria-label="Graph pages">
        <span>Page {page} · connections within this page</span>
        {page > 1 && <Link href={`/graph?page=${page - 1}`}>Previous</Link>}
        {hasMore && <Link href={`/graph?page=${page + 1}`}>Next</Link>}
      </nav>}

    </div>
  );
}

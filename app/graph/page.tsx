import { KnowledgeGraphPanel } from '@/components/graph/KnowledgeGraphPanel';
import { apiGet } from '@/lib/api';
import type { Graph } from '@/lib/api-types';
import { cleanTitle } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function GraphPage() {
  const { nodes, links } = await apiGet<Graph>('/graph');
  const graphData: Graph = {
    nodes: nodes.map((node) => ({ ...node, title: cleanTitle(node.title) })),
    links,
  };

  return (
    <div className="relative h-full w-full">
      <KnowledgeGraphPanel data={graphData} />

    </div>
  );
}

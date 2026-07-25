import { AutomaticLinkControl } from '@/components/graph/AutomaticLinkControl';
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
  const automatic = links.filter((link) => link.origin === 'AI').length;

  return (
    <div className="relative h-full w-full">
      <KnowledgeGraphPanel data={graphData} />
      {/* Stacked above the canvas's own zoom cluster, which owns the bottom-right corner
          (the rest of its chrome: title/search top-left, legend bottom-left, inspector top-right). */}
      <div className="pointer-events-none absolute bottom-16 right-3">
        <div className="pointer-events-auto rounded-[12px] border-thin bg-surface/85 px-4 py-2.5 shadow-card backdrop-blur-md">
          <AutomaticLinkControl count={automatic} />
        </div>
      </div>
    </div>
  );
}

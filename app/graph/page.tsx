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

  // Full-bleed: fill the viewport below the top nav (and above the mobile bottom nav).
  return (
    <div className="fixed inset-x-0 bottom-14 top-14 md:bottom-0">
      <KnowledgeGraphPanel data={graphData} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
        <div className="pointer-events-auto rounded-card border-thin bg-surface/90 px-4 py-2.5 shadow-card backdrop-blur">
          <AutomaticLinkControl count={automatic} />
        </div>
      </div>
    </div>
  );
}

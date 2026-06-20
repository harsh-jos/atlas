import { KnowledgeGraphPanel } from '@/components/graph/KnowledgeGraphPanel';
import { getKnowledgeGraphData } from '@/lib/graph-data';

export const dynamic = 'force-dynamic';

export default async function GraphPage() {
  const graphData = await getKnowledgeGraphData();

  // Full-bleed: fill the viewport below the top nav (and above the mobile bottom nav).
  return (
    <div className="fixed inset-x-0 bottom-14 top-14 md:bottom-0">
      <KnowledgeGraphPanel data={graphData} />
    </div>
  );
}

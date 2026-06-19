import { KnowledgeGraphPanel } from '@/components/graph/KnowledgeGraphPanel';
import { getKnowledgeGraphData } from '@/lib/graph-data';

export const dynamic = 'force-dynamic';

export default async function GraphPage() {
  const graphData = await getKnowledgeGraphData();

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <div className="mb-7">
        <h1 className="font-display text-[32px] font-bold leading-none tracking-[-0.03em] text-ink">Graph</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-6 text-muted">
          Published entries and their typed relations.
        </p>
      </div>

      <KnowledgeGraphPanel data={graphData} />
    </div>
  );
}

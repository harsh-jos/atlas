import { KnowledgeGraphPanel } from '@/components/graph/KnowledgeGraphPanel';
import { getKnowledgeGraphData } from '@/lib/graph-data';

export const dynamic = 'force-dynamic';

export default async function GraphPage() {
  const graphData = await getKnowledgeGraphData();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-lg font-medium text-zinc-900">Graph</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          Published entries and their typed relations.
        </p>
      </div>

      <KnowledgeGraphPanel data={graphData} />
    </div>
  );
}

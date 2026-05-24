'use client';

import dynamic from 'next/dynamic';
import type { KnowledgeGraphData } from '@/lib/graph-data';

const KnowledgeGraphCanvas = dynamic(
  () => import('@/components/graph/KnowledgeGraphCanvas').then((mod) => mod.KnowledgeGraphCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[560px] items-center justify-center rounded-lg border-thin border-zinc-200/80 bg-white">
        <p className="text-sm text-zinc-500">Loading graph</p>
      </div>
    ),
  }
);

export interface KnowledgeGraphPanelProps {
  data: KnowledgeGraphData;
}

export function KnowledgeGraphPanel({ data }: KnowledgeGraphPanelProps) {
  if (data.nodes.length === 0) {
    return (
      <div className="rounded-lg border-thin border-zinc-200/80 bg-white p-8">
        <p className="text-sm text-zinc-500">Publish entries to populate the graph.</p>
      </div>
    );
  }

  return <KnowledgeGraphCanvas data={data} />;
}

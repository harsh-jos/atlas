'use client';

import dynamic from 'next/dynamic';
import { Share2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import type { KnowledgeGraphData } from '@/lib/graph-data';

const GraphExplorer = dynamic(
  () => import('@/components/graph/GraphExplorer').then((mod) => mod.GraphExplorer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-canvas">
        <p className="animate-pulse text-sm text-muted">Loading graph…</p>
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
      <div className="flex h-full w-full items-center justify-center px-6">
        <EmptyState
          icon={<Share2 className="h-4 w-4" />}
          title="The graph is empty"
          description="Add entries and connect them with relations to see them here."
        />
      </div>
    );
  }

  return <GraphExplorer data={data} />;
}

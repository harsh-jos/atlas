'use client';

import dynamic from 'next/dynamic';
import { Share2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import type { KnowledgeGraphData } from '@/lib/graph-data';

const KnowledgeGraphCanvas = dynamic(
  () => import('@/components/graph/KnowledgeGraphCanvas').then((mod) => mod.KnowledgeGraphCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[560px] items-center justify-center rounded-[12px] border-thin bg-surface shadow-card">
        <p className="text-sm text-muted">Loading graph</p>
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
      <EmptyState
        icon={<Share2 className="h-4 w-4" />}
        title="The graph is empty"
        description="Publish entries and connect them with relations to see them here."
      />
    );
  }

  return <KnowledgeGraphCanvas data={data} />;
}

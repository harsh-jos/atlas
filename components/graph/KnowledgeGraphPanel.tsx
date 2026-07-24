'use client';

import dynamic from 'next/dynamic';
import { Share2 } from 'lucide-react';
import type { Graph } from '@/lib/api-types';

const KnowledgeGraph3D = dynamic(
  () => import('@/components/graph/KnowledgeGraph3D').then((mod) => mod.KnowledgeGraph3D),
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
  data: Graph;
}

export function KnowledgeGraphPanel({ data }: KnowledgeGraphPanelProps) {
  if (data.nodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-canvas px-6">
        <div className="flex max-w-sm flex-col items-center text-center">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border-thin bg-surface text-muted shadow-card">
            <Share2 className="h-4 w-4" />
          </div>
          <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink">
            The graph is empty
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Add entries and connect them with relations to see them here.
          </p>
        </div>
      </div>
    );
  }

  return <KnowledgeGraph3D data={data} />;
}

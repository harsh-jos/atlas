'use client';

import dynamic from 'next/dynamic';
import { Share2 } from 'lucide-react';
import type { Graph } from '@/lib/api-types';

const KnowledgeGraph = dynamic(
  () => import('@/components/graph/KnowledgeGraph').then((mod) => mod.KnowledgeGraph),
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
      <div className="relative flex h-full w-full items-center justify-center bg-canvas px-6">
        <div
          className="dot-grid pointer-events-none absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(320px_220px_at_50%_50%,black,transparent)]"
          aria-hidden="true"
        />
        <div className="relative flex max-w-sm flex-col items-center text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[13px] border bg-surface text-faint shadow-card">
            <Share2 className="h-4 w-4" />
          </div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
            The graph is empty
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Explore an idea with Atlas. Concepts and saved explanations will appear here.
          </p>
        </div>
      </div>
    );
  }

  return <KnowledgeGraph data={data} />;
}

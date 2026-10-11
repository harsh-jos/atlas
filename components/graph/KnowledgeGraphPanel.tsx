'use client';

import dynamic from 'next/dynamic';
import { Share2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageContainer, PageHeader } from '@/components/layout/PageHeader';
import type { Graph } from '@/lib/api-types';

const KnowledgeGraph = dynamic(
  () =>
    import('@/components/graph/KnowledgeGraph').then(
      (mod) => mod.KnowledgeGraph,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-canvas">
        <p className="animate-pulse text-sm text-muted">Loading graph…</p>
      </div>
    ),
  },
);

export interface KnowledgeGraphPanelProps {
  data: Graph;
}

export function KnowledgeGraphPanel({ data }: KnowledgeGraphPanelProps) {
  if (data.nodes.length === 0) {
    return (
      <PageContainer>
        <PageHeader
          title="Knowledge graph"
          description="A map of the ideas you’ve explored and the connections between them."
        />
        <EmptyState
          icon={<Share2 className="size-5" />}
          title="Every idea starts a connection"
          description="Explore a question with Atlas. Concepts and saved explanations will find their place here."
          action={{ label: 'Explore your first idea', href: '/chat' }}
        />
      </PageContainer>
    );
  }

  return <KnowledgeGraph data={data} />;
}

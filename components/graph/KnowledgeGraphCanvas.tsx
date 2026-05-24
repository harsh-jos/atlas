'use client';

import * as React from 'react';
import ForceGraph2D, {
  ForceGraphMethods,
  GraphData,
  NodeObject,
} from 'react-force-graph-2d';
import { useRouter } from 'next/navigation';
import type {
  KnowledgeGraphData,
  KnowledgeGraphLink,
  KnowledgeGraphNode,
} from '@/lib/graph-data';

export interface KnowledgeGraphCanvasProps {
  data: KnowledgeGraphData;
}

type GraphNode = NodeObject<KnowledgeGraphNode>;

const relationColors: Record<KnowledgeGraphLink['relationType'], string> = {
  PART_OF: '#71717a',
  USES: '#2563eb',
  PREREQUISITE: '#16a34a',
  CONTRASTS: '#b45309',
  SEE_ALSO: '#8b5cf6',
};

export function KnowledgeGraphCanvas({ data }: KnowledgeGraphCanvasProps) {
  const router = useRouter();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const graphRef = React.useRef<ForceGraphMethods<KnowledgeGraphNode, KnowledgeGraphLink> | undefined>(
    undefined
  );
  const [dimensions, setDimensions] = React.useState({ width: 960, height: 560 });

  const graphData = React.useMemo<GraphData<KnowledgeGraphNode, KnowledgeGraphLink>>(
    () => ({
      nodes: data.nodes,
      links: data.links,
    }),
    [data.links, data.nodes]
  );

  React.useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      const width = Math.max(320, Math.floor(entry.contentRect.width));
      setDimensions({ width, height: 560 });
    });

    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  // Spread nodes out so labels don't collide; defaults pack them too tightly.
  React.useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.d3Force('charge')?.strength(-220);
    graph.d3Force('link')?.distance(90);
    graph.d3ReheatSimulation();
  }, [graphData]);

  const handleEngineStop = React.useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.zoomToFit(400, 80);
    // zoomToFit fills the viewport, which over-zooms small graphs (giant
    // nodes, overlapping labels). Clamp to a sane max once the fit lands.
    window.setTimeout(() => {
      const g = graphRef.current;
      if (g && g.zoom() > 2.5) {
        g.zoom(2.5, 400);
      }
    }, 450);
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border-thin border-zinc-200/80 bg-white">
      <div className="border-b-thin border-zinc-200/80 px-4 py-3">
        <h2 className="text-sm font-medium text-zinc-900">Knowledge graph</h2>
        <p className="mt-1 text-xs text-zinc-500">
          {data.nodes.length} {data.nodes.length === 1 ? 'entry' : 'entries'}{' '}
          <span aria-hidden="true">/</span> {data.links.length}{' '}
          {data.links.length === 1 ? 'relation' : 'relations'}
        </p>
      </div>
      <div ref={containerRef} className="h-[560px]">
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="#ffffff"
          nodeId="id"
          nodeLabel={(node) => `${node.title} (${node.collectionName})`}
          nodeColor={(node) => node.collectionColor}
          nodeRelSize={5}
          linkColor={(link) => relationColors[link.relationType] ?? '#a1a1aa'}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          linkWidth={1}
          cooldownTicks={80}
          warmupTicks={40}
          onEngineStop={handleEngineStop}
          onNodeClick={(node) => router.push(`/entries/${node.slug}`)}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={paintNodePointerArea}
        />
      </div>
    </div>
  );
}

function paintNode(node: GraphNode, context: CanvasRenderingContext2D, globalScale: number) {
  const label = node.title;
  // Keep label ~12px on screen at any zoom (divide by scale; no graph-unit floor).
  const fontSize = 12 / globalScale;
  const radius = 4.5;
  const x = node.x ?? 0;
  const y = node.y ?? 0;

  context.beginPath();
  context.arc(x, y, radius, 0, 2 * Math.PI, false);
  context.fillStyle = node.collectionColor;
  context.fill();
  context.strokeStyle = '#ffffff';
  context.lineWidth = 1.5 / globalScale;
  context.stroke();

  context.font = `400 ${fontSize}px var(--font-geist-sans), system-ui, sans-serif`;
  context.fillStyle = '#3f3f46';
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillText(label, x, y + radius + 3);
}

function paintNodePointerArea(
  node: GraphNode,
  paintColor: string,
  context: CanvasRenderingContext2D
) {
  const x = node.x ?? 0;
  const y = node.y ?? 0;

  context.fillStyle = paintColor;
  context.beginPath();
  context.arc(x, y, 16, 0, 2 * Math.PI, false);
  context.fill();
}

import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
} from 'd3-force-3d';
import type { Graph, GraphNode } from '@/lib/api-types';

export type PositionedNode = GraphNode & {
  x: number;
  y: number;
  fx: number;
  fy: number;
};

// Solve once, before painting. The renderer keeps these positions fixed until
// the reader drags a node. Normalize the axes to the actual canvas aspect ratio.
export function arrangeGraph(data: Graph, aspect: number): PositionedNode[] {
  const ids = new Set(data.nodes.map((node) => node.id));
  // Let d3 initialize a deterministic spiral instead of starting every node at zero.
  const simulationNodes = data.nodes.map((node) => ({ ...node })) as Array<
    GraphNode & { x: number; y: number }
  >;
  const links = data.links
    .filter((link) => ids.has(link.source) && ids.has(link.target))
    .map((link) => ({ ...link }));
  forceSimulation(simulationNodes, 2)
    .force('charge', forceManyBody().strength(-420))
    .force(
      'link',
      forceLink(links)
        .id((node) => String(node.id))
        .distance(100)
        .strength(0.12),
    )
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide(22))
    .stop()
    .tick(240);
  if (!simulationNodes.length) return [];
  const xs = simulationNodes.map((node) => node.x),
    ys = simulationNodes.map((node) => node.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const ratio = Math.max(0.45, Math.min(3, aspect));
  const size = Math.max(180, Math.sqrt(simulationNodes.length) * 65);
  return simulationNodes.map((node) => {
    const x =
      maxX === minX
        ? 0
        : ((node.x - minX) / (maxX - minX) - 0.5) * size * Math.sqrt(ratio);
    const y =
      maxY === minY
        ? 0
        : (((node.y - minY) / (maxY - minY) - 0.5) * size) / Math.sqrt(ratio);
    return { ...node, x, y, fx: x, fy: y };
  });
}

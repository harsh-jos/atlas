import type { Graph, GraphNode, GraphLink } from '@/lib/api-types';

export type RelationKind = GraphLink['relationType'];
export const UNDIRECTED = new Set<RelationKind>([
  'related_to',
  'SEE_ALSO',
  'CONTRASTS',
]);
export const RELATION_LABELS: Record<RelationKind, string> = {
  requires: 'Builds on',
  related_to: 'Related to',
  explains: 'Explains',
  PART_OF: 'Part of',
  USES: 'Uses',
  PREREQUISITE: 'Prerequisite',
  CONTRASTS: 'Contrasts with',
  SEE_ALSO: 'See also',
};

export function initialFocus(data: Graph): string | null {
  const degree = new Map<string, number>();
  for (const link of data.links) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }
  const concepts = data.nodes.filter((node) => node.nodeKind === 'concept');
  return (
    [...(concepts.length ? concepts : data.nodes)].sort(
      (a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0),
    )[0]?.id ?? null
  );
}

// Traverse relationship filters first, then apply node-type filters. A hidden
// concept can still provide context for the explanations that belong to it.
export function visibleNodeIds(
  data: Graph,
  root: string | null,
  depth: number,
  kinds: Set<GraphNode['nodeKind']>,
  relations: Set<RelationKind>,
): Set<string> {
  let reached = new Set(data.nodes.map((node) => node.id));
  if (root !== null) {
    reached = new Set([root]);
    let frontier = new Set([root]);
    for (let hop = 0; hop < depth && frontier.size; hop++) {
      const next = new Set<string>();
      for (const link of data.links) {
        if (!relations.has(link.relationType)) continue;
        if (frontier.has(link.source) && !reached.has(link.target))
          next.add(link.target);
        if (frontier.has(link.target) && !reached.has(link.source))
          next.add(link.source);
      }
      for (const id of next) reached.add(id);
      frontier = next;
    }
  }
  return new Set(
    data.nodes
      .filter((node) => reached.has(node.id) && kinds.has(node.nodeKind))
      .map((node) => node.id),
  );
}

export interface Point {
  x: number;
  y: number;
}
export interface LabelCandidate extends Point {
  id: string;
  radius: number;
  width: number;
  priority: number;
}
export interface LabelPlacement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function fitCamera(points: Point[], width: number, height: number) {
  const finite = points.filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
  );
  if (!finite.length) return null;
  const xs = finite.map((point) => point.x),
    ys = finite.map((point) => point.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const padding = Math.min(48, Math.min(width, height) * 0.12);
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    zoom: Math.max(
      0.02,
      Math.min(
        4,
        (width - padding * 2) / Math.max(40, maxX - minX),
        (height - padding * 2) / Math.max(40, maxY - minY),
      ),
    ),
  };
}

export function placeLabels(
  candidates: LabelCandidate[],
  nodes: Array<Point & { id: string; radius: number }>,
  width: number,
  height: number,
  budget: number,
): LabelPlacement[] {
  const placed: LabelPlacement[] = [];
  const overlaps = (a: LabelPlacement, b: LabelPlacement) =>
    a.x < b.x + b.width + 4 &&
    a.x + a.width + 4 > b.x &&
    a.y < b.y + b.height + 4 &&
    a.y + a.height + 4 > b.y;
  for (const node of [...candidates].sort((a, b) => a.priority - b.priority)) {
    if (placed.length >= budget) break;
    const positions = [
      { x: node.x - node.width / 2, y: node.y + node.radius + 5 },
      { x: node.x - node.width / 2, y: node.y - node.radius - 19 },
      { x: node.x + node.radius + 6, y: node.y - 7 },
      { x: node.x - node.radius - node.width - 6, y: node.y - 7 },
    ];
    for (const point of positions) {
      const box = { ...point, id: node.id, width: node.width, height: 14 };
      if (
        box.x < 6 ||
        box.y < 6 ||
        box.x + box.width > width - 6 ||
        box.y + box.height > height - 34
      )
        continue;
      if (placed.some((other) => overlaps(box, other))) continue;
      if (
        nodes.some(
          (other) =>
            other.id !== node.id &&
            overlaps(box, {
              id: other.id,
              x: other.x - other.radius,
              y: other.y - other.radius,
              width: other.radius * 2,
              height: other.radius * 2,
            }),
        )
      )
        continue;
      placed.push(box);
      break;
    }
  }
  return placed;
}

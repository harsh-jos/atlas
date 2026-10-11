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

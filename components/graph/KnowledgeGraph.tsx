'use client';

import * as React from 'react';
import Link from 'next/link';
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from 'react-force-graph-2d';
import { arrangeGraph } from './graph-layout';
import {
  ArrowUpRight,
  Maximize2,
  Minus,
  Plus,
  Search,
  X,
  SlidersHorizontal,
  Circle,
  FileText,
  Expand,
  RotateCcw,
  Network,
} from 'lucide-react';
import { Button } from '@/components/shadcn/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/shadcn/popover';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/shadcn/tooltip';
import {
  initialFocus,
  fitCamera,
  placeLabels,
  visibleNodeIds,
  RELATION_LABELS,
  UNDIRECTED,
  type RelationKind,
} from './graph-model';
import { cn } from '@/lib/utils';
import type {
  Graph,
  GraphLink as ApiGraphLink,
  GraphNode as ApiGraphNode,
} from '@/lib/api-types';
import {
  RELATION_INCOMING_LABELS,
  RELATION_OUTGOING_LABELS,
} from '@/lib/relations';

const outgoingLabels = {
  ...RELATION_OUTGOING_LABELS,
  contrasts_with: 'Contrasts with',
  uses: 'Uses',
  part_of: 'Part of',
  enables: 'Enables',
  requires: 'Builds on',
  related_to: 'Related to',
  explains: 'Explains',
};
const incomingLabels = {
  ...RELATION_INCOMING_LABELS,
  contrasts_with: 'Contrasts with',
  uses: 'Used by',
  part_of: 'Contains',
  enables: 'Enabled by',
  requires: 'Used by',
  related_to: 'Related to',
  explains: 'Explained by',
};

type GraphNode = NodeObject<ApiGraphNode>;
type GraphLink = LinkObject<ApiGraphNode, ApiGraphLink>;
type GraphMethods = ForceGraphMethods<GraphNode, GraphLink>;

export interface KnowledgeGraphProps {
  data: Graph;
}

// Canvas can't read CSS variables, so this palette mirrors the tokens in globals.css.
const BACKGROUND = '#f5f8fb'; // --canvas
const GRID_DOT = 'rgba(0, 0, 0, 0.05)';
const NODE_HALO = '#f5f8fb'; // gap that lifts a node off crossing links — matches BACKGROUND
const LABEL_INK = '#000000'; // --ink
const LABEL_HALO = 'rgba(245, 248, 251, 0.92)'; // keeps text crisp over edges
const LINK_BASE = 'rgba(0, 0, 0, 0.3)';
const LINK_DENSE = 'rgba(0, 0, 0, 0.14)';
const LINK_ACTIVE = 'rgba(8, 120, 176, 0.7)'; // --accent
const LINK_DIM = 'rgba(115, 115, 115, 0.06)';
const RING = 'rgba(8, 120, 176, 0.95)'; // --accent
const GLOW = 'rgba(8, 120, 176, 0.3)'; // soft halo under the focused node
const DIM_ALPHA = 0.12; // out-of-focus nodes on hover — faint, never gone

const HUB_LABELS = 8; // concept hubs receive priority in the label budget
const LABEL_FONT = 12; // px on screen, constant across zoom
const LABEL_MAX_CHARS = 36;

const GRID_SPACING = 36; // graph units between ground dots
const GRID_MIN_PX = 18; // spacing doubles until dots sit at least this far apart on screen

function resolveId(end: GraphLink['source']): string {
  return typeof end === 'object' && end !== null
    ? String((end as GraphNode).id)
    : String(end);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * The knowledge graph as a spatial surface: a dotted ground that pans and zooms
 * with the graph, collection-colored nodes sized by connectedness, and labels
 * that come to you — hubs always, everything else as you zoom or hover.
 */
export function KnowledgeGraph({ data }: KnowledgeGraphProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const graphRef = React.useRef<GraphMethods | undefined>(undefined);

  const [dimensions, setDimensions] = React.useState({
    width: 0,
    height: 0,
  });
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [layoutAspect, setLayoutAspect] = React.useState<number | null>(null);
  const [hoverLinkId, setHoverLinkId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string | null>(() =>
    initialFocus(data),
  );
  const [view, setView] = React.useState<'neighbourhood' | 'all'>(
    'neighbourhood',
  );
  const [depth, setDepth] = React.useState(1);
  const [kinds, setKinds] = React.useState(
    new Set<ApiGraphNode['nodeKind']>(['concept', 'explanation']),
  );
  const allRelations = React.useMemo(
    () => new Set(data.links.map((link) => link.relationType)),
    [data.links],
  );
  const [relations, setRelations] = React.useState(
    () => new Set(data.links.map((link) => link.relationType)),
  );
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [zoom, setZoom] = React.useState(1);
  const [graphReady, setGraphReady] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const fontRef = React.useRef('system-ui, sans-serif');
  React.useEffect(() => {
    fontRef.current = getComputedStyle(document.body).fontFamily;
  }, []);
  const visibleIds = React.useMemo(
    () =>
      visibleNodeIds(
        data,
        view === 'neighbourhood' ? selectedId : null,
        depth,
        kinds,
        relations,
      ),
    [data, view, selectedId, depth, kinds, relations],
  );
  const expandedIds = React.useMemo(
    () =>
      visibleNodeIds(
        data,
        view === 'neighbourhood' ? selectedId : null,
        depth + 1,
        kinds,
        relations,
      ),
    [data, view, selectedId, depth, kinds, relations],
  );
  const canExpand = expandedIds.size > visibleIds.size;
  const visibleEdges = data.links.filter(
    (link) =>
      relations.has(link.relationType) &&
      visibleIds.has(link.source) &&
      visibleIds.has(link.target),
  );
  const filtersActive =
    kinds.size !== 2 || relations.size !== allRelations.size;
  const searchMatches = query.trim()
    ? data.nodes
        .filter((node) =>
          node.title.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .slice(0, 6)
    : [];
  const layoutKey = React.useMemo(() => {
    let hash = 0;
    for (const char of data.nodes
      .map((node) => node.id)
      .sort()
      .join('|'))
      hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return `atlas-graph-layout-v2:${hash}`;
  }, [data.nodes]);
  const [searchNotice, setSearchNotice] = React.useState('');

  // The engine mutates x/y onto these node objects in place, so they must be copies the parent
  // never re-creates — otherwise every render would restart the layout.
  const graphData = React.useMemo(() => {
    let positions: Record<string, { x: number; y: number }> = {};
    try {
      positions = JSON.parse(sessionStorage.getItem(layoutKey) || '{}') ?? {};
    } catch {
      /* Optional persistence. */
    }
    const arranged =
      layoutAspect == null ? [] : arrangeGraph(data, layoutAspect);
    return {
      nodes: arranged.map((n) => {
        const position = positions[n.id];
        return position &&
          Number.isFinite(position.x) &&
          Number.isFinite(position.y)
          ? {
              ...n,
              x: position.x,
              y: position.y,
              fx: position.x,
              fy: position.y,
            }
          : n;
      }),
      links: data.links.map((link) => ({ ...link })),
    };
  }, [data, layoutKey, layoutAspect]);

  const nodeById = React.useMemo(() => {
    const map = new Map<string, ApiGraphNode>();
    for (const node of data.nodes) map.set(node.id, node);
    return map;
  }, [data.nodes]);

  // Degree drives node size and hub labels; adjacency drives the hover neighbourhood.
  const { adjacency, degree } = React.useMemo(() => {
    const adj = new Map<string, Set<string>>();
    const deg = new Map<string, number>();
    const link = (a: string, b: string) => {
      if (!adj.has(a)) adj.set(a, new Set());
      adj.get(a)!.add(b);
      deg.set(a, (deg.get(a) ?? 0) + 1);
    };
    for (const edge of data.links) {
      const s = resolveId(edge.source);
      const t = resolveId(edge.target);
      link(s, t);
      link(t, s);
    }
    return { adjacency: adj, degree: deg };
  }, [data.links]);

  const hubIds = React.useMemo(() => {
    const ranked = [...degree.entries()].sort((a, b) => b[1] - a[1]);
    return new Set(ranked.slice(0, HUB_LABELS).map(([id]) => id));
  }, [degree]);

  const radiusFor = React.useCallback(
    (id: string) => Math.min(11, 3.5 + Math.sqrt(degree.get(id) ?? 0) * 1.5),
    [degree],
  );

  // Fill the container and track resizes. Guarded so an unchanged size never re-renders.
  React.useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, Math.floor(entry.contentRect.width));
      const height = Math.max(1, Math.floor(entry.contentRect.height));
      setLayoutAspect((previous) => previous ?? width / height);
      setDimensions((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const hasFramed = React.useRef(false);
  const saveLayout = React.useCallback(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const node of graphData.nodes as GraphNode[]) {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;
      positions[String(node.id)] = { x: node.x!, y: node.y! };
    }
    try {
      sessionStorage.setItem(layoutKey, JSON.stringify(positions));
    } catch {
      /* Optional persistence. */
    }
  }, [graphData, layoutKey]);
  const fitVisible = React.useCallback(() => {
    const graph = graphRef.current;
    const camera = fitCamera(
      graphData.nodes.filter((node) => visibleIds.has(node.id)),
      dimensions.width,
      dimensions.height,
    );
    if (!graph || !camera) return;
    // Apply zoom first, then centre: no stale bounding-box cache or pending camera tween.
    graph.zoom(camera.zoom, 0);
    graph.centerAt(camera.x, camera.y, 0);
  }, [visibleIds, graphData, dimensions]);
  const handleEngineStop = React.useCallback(() => {
    saveLayout();
    setGraphReady(true);
    if (!hasFramed.current) {
      hasFramed.current = true;
      fitVisible();
    }
  }, [saveLayout, fitVisible]);
  React.useEffect(() => {
    if (!hasFramed.current || !visibleIds.size) return;
    let secondFrame = 0;
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(fitVisible);
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(secondFrame);
    };
  }, [fitVisible, dimensions, visibleIds.size]);

  const activeId = hoverId ?? selectedId;
  const neighbors = activeId ? adjacency.get(activeId) : undefined;

  // The ground: a dot field fixed in graph space, so it pans and zooms with the
  // graph and the surface reads as a place rather than a picture. Spacing doubles
  // as you zoom out so the field stays airy at every distance.
  const paintGrid = React.useCallback(
    (ctx: CanvasRenderingContext2D, scale: number) => {
      const graph = graphRef.current;
      if (!graph) return;
      let spacing = GRID_SPACING;
      while (spacing * scale < GRID_MIN_PX) spacing *= 2;
      const topLeft = graph.screen2GraphCoords(0, 0);
      const bottomRight = graph.screen2GraphCoords(
        dimensions.width,
        dimensions.height,
      );
      const r = 0.9 / scale; // ~1px on screen at any zoom
      const x0 = Math.floor(topLeft.x / spacing) * spacing;
      const y0 = Math.floor(topLeft.y / spacing) * spacing;
      ctx.fillStyle = GRID_DOT;
      for (let x = x0; x <= bottomRight.x + spacing; x += spacing) {
        for (let y = y0; y <= bottomRight.y + spacing; y += spacing) {
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
      }
    },
    [dimensions],
  );

  // Canvas accessors are rendering-only in 2D (no persistent scene objects, no engine
  // reheat), so reading hover/selection straight from state here is safe and just repaints.
  const paintNode = React.useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, scale: number) => {
      if (node.x == null || node.y == null) return;
      const id = String(node.id);
      const r = radiusFor(id) / Math.sqrt(scale);
      const focused = id === hoverId || id === selectedId;
      const inHoverFocus =
        hoverId == null || focused || (neighbors?.has(id) ?? false);
      const dimmed = !inHoverFocus;

      ctx.globalAlpha = dimmed ? DIM_ALPHA : 1;

      if (focused) {
        ctx.shadowColor = GLOW;
        ctx.shadowBlur = 14;
      }

      // Concepts are circles; explanations have a document silhouette.
      ctx.beginPath();
      if (node.nodeKind === 'concept') {
        ctx.arc(node.x, node.y, r + 1, 0, 2 * Math.PI);
        ctx.fillStyle = NODE_HALO;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = node.conceptColor;
        ctx.fill();
      } else {
        ctx.roundRect(node.x - r, node.y - r * 1.2, r * 2, r * 2.4, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 1.3 / scale;
        ctx.strokeStyle = focused ? RING : '#595959';
        ctx.stroke();
        for (let line = -1; r * scale > 5 && line <= 1; line++) {
          ctx.beginPath();
          ctx.moveTo(node.x - r * 0.5, node.y + line * r * 0.5);
          ctx.lineTo(node.x + r * 0.5, node.y + line * r * 0.5);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.roundRect(node.x - r, node.y - r * 1.2, r * 2, r * 2.4, 2);
      }
      ctx.shadowBlur = 0;
      if (focused) {
        ctx.lineWidth = 2 / scale;
        ctx.strokeStyle = RING;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    },
    [radiusFor, hoverId, selectedId, neighbors],
  );

  // Labels are a separate pass, ordered by importance and tested for collisions
  // in screen pixels. Selecting a hub never labels all of its neighbours.
  const paintLabels = React.useCallback(
    (ctx: CanvasRenderingContext2D, scale: number) => {
      const graph = graphRef.current;
      if (!graph) return;
      ctx.font = `500 ${LABEL_FONT}px ${fontRef.current}`;
      const nodes = graphData.nodes
        .filter((node) => visibleIds.has(node.id))
        .map((node) => ({
          ...node,
          ...graph.graph2ScreenCoords(node.x, node.y),
          radius: radiusFor(node.id) * Math.sqrt(scale),
        }));
      const labels = new Map<string, string>();
      const candidates = nodes
        .filter(
          (node) =>
            node.id === selectedId ||
            node.id === hoverId ||
            node.nodeKind === 'concept' ||
            (scale >= 1.8 && visibleIds.size <= 40),
        )
        .map((node) => {
          const label = truncate(
            node.title,
            dimensions.width < 500 ? 26 : LABEL_MAX_CHARS,
          );
          labels.set(node.id, label);
          return {
            ...node,
            width: ctx.measureText(label).width,
            priority:
              node.id === hoverId
                ? 0
                : node.id === selectedId
                  ? 1
                  : hubIds.has(node.id)
                    ? 2
                    : node.nodeKind === 'concept'
                      ? 3
                      : 4,
          };
        });
      const budget = Math.max(
        3,
        Math.min(
          scale >= 1.8 ? 24 : 12,
          Math.floor((dimensions.width * dimensions.height) / 28000),
        ),
      );
      const placed = placeLabels(
        candidates,
        nodes,
        dimensions.width,
        dimensions.height,
        budget,
      );
      ctx.font = `500 ${LABEL_FONT / scale}px ${fontRef.current}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.globalAlpha = 1;
      for (const label of placed) {
        const point = graph.screen2GraphCoords(label.x, label.y);
        ctx.lineWidth = 3 / scale;
        ctx.strokeStyle = LABEL_HALO;
        ctx.strokeText(labels.get(label.id)!, point.x, point.y);
        ctx.fillStyle = LABEL_INK;
        ctx.fillText(labels.get(label.id)!, point.x, point.y);
      }
    },
    [graphData, visibleIds, radiusFor, selectedId, hoverId, dimensions, hubIds],
  );

  // The clickable/hoverable area matches the drawn circle (plus a small forgiving margin).
  const paintPointerArea = React.useCallback(
    (node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
      if (node.x == null || node.y == null) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      const scale = Math.max(0.2, graphRef.current?.zoom() ?? 1);
      ctx.arc(
        node.x,
        node.y,
        radiusFor(String(node.id)) / Math.sqrt(scale) + 6 / scale,
        0,
        2 * Math.PI,
      );
      ctx.fill();
    },
    [radiusFor],
  );

  const linkActive = React.useCallback(
    (link: GraphLink) =>
      hoverLinkId ===
        `${resolveId(link.source)}:${link.relationType}:${resolveId(link.target)}` ||
      ((hoverId != null || visibleEdges.length < 35) &&
        activeId != null &&
        (resolveId(link.source) === activeId ||
          resolveId(link.target) === activeId)),
    [activeId, hoverId, hoverLinkId, visibleEdges.length],
  );
  const linkColor = React.useCallback(
    (link: GraphLink) =>
      linkActive(link)
        ? LINK_ACTIVE
        : hoverId != null || hoverLinkId != null
          ? LINK_DIM
          : visibleEdges.length > 80
            ? LINK_DENSE
            : LINK_BASE,
    [hoverId, hoverLinkId, visibleEdges.length, linkActive],
  );
  const linkWidth = React.useCallback(
    (link: GraphLink) => (linkActive(link) ? 1.5 : 1),
    [linkActive],
  );
  const paintLinkLabel = React.useCallback(
    (link: GraphLink, ctx: CanvasRenderingContext2D, scale: number) => {
      if (
        hoverLinkId !==
        `${resolveId(link.source)}:${link.relationType}:${resolveId(link.target)}`
      )
        return;
      const source = link.source as GraphNode,
        target = link.target as GraphNode;
      if (
        source.x == null ||
        source.y == null ||
        target.x == null ||
        target.y == null
      )
        return;
      const dx = target.x - source.x,
        dy = target.y - source.y;
      const length = Math.hypot(dx, dy) || 1;
      const side = dx < 0 ? 1 : -1;
      const offset = 20 / scale;
      const x = (source.x + target.x) / 2 - (dy / length) * offset * side;
      const y = (source.y + target.y) / 2 + (dx / length) * offset * side;
      const label = RELATION_LABELS[link.relationType];
      ctx.font = `${10 / scale}px ${fontRef.current}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const width = ctx.measureText(label).width;
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(
        x - width / 2 - 4 / scale,
        y - 7 / scale,
        width + 8 / scale,
        14 / scale,
      );
      ctx.fillStyle = LABEL_INK;
      ctx.fillText(label, x, y);
    },
    [hoverLinkId],
  );

  const selectNode = React.useCallback((node: GraphNode) => {
    setSelectedId(String(node.id));
    setDepth(1);
    setQuery('');
    setSearchOpen(false);
    setSearchNotice('');
  }, []);
  const focusById = React.useCallback(
    (id: string) => {
      const node = graphData.nodes.find((n) => String(n.id) === id) as
        | GraphNode
        | undefined;
      if (!node) return;
      // Search and connection navigation reveal their destination, even after filtering.
      setKinds((current) => new Set([...current, node.nodeKind]));
      setRelations(new Set(allRelations));
      selectNode(node);
      setView('neighbourhood');
    },
    [graphData, selectNode, allRelations],
  );
  const showAll = () => {
    setView('all');
    setSelectedId(null);
    setDepth(1);
    setKinds(new Set(['concept', 'explanation']));
    setRelations(new Set(allRelations));
    setQuery('');
    setSearchNotice('');
    setHoverId(null);
  };

  const zoomBy = (factor: number) => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.zoom(graph.zoom() * factor, 0);
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = data.nodes.find((node) => node.title.toLowerCase().includes(q));
    if (hit) {
      focusById(hit.id);
      setSearchNotice('');
    } else {
      setSearchNotice('No matching idea on this graph page. Try another name.');
    }
  };

  const selectedNode = selectedId ? (nodeById.get(selectedId) ?? null) : null;

  const selectedRelations = React.useMemo(() => {
    if (!selectedId)
      return [] as Array<{ label: string; items: ApiGraphNode[] }>;
    const groups = new Map<string, ApiGraphNode[]>();
    const push = (label: string, id: string) => {
      const node = nodeById.get(id);
      if (!node || !kinds.has(node.nodeKind)) return;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(node);
    };
    for (const link of data.links) {
      const s = resolveId(link.source);
      const t = resolveId(link.target);
      if (!relations.has(link.relationType)) continue;
      if (s === selectedId) push(outgoingLabels[link.relationType], t);
      else if (t === selectedId) {
        const label = UNDIRECTED.has(link.relationType)
          ? outgoingLabels[link.relationType]
          : incomingLabels[link.relationType];
        if (label) push(label, s);
      }
    }
    return [...groups.entries()].map(([label, items]) => ({ label, items }));
  }, [selectedId, data.links, nodeById, relations, kinds]);

  const toggleKind = (kind: ApiGraphNode['nodeKind']) =>
    setKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  const toggleRelation = (kind: RelationKind) =>
    setRelations((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-white"
      aria-label="Knowledge graph explorer"
    >
      <header className="shrink-0 border-b px-3 py-2.5 sm:px-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h1 className="text-sm font-semibold text-ink">Knowledge graph</h1>
          <p
            role="status"
            aria-label="Visible graph"
            className="text-[11px] tabular-nums text-muted"
          >
            {visibleIds.size} of {data.nodes.length} nodes ·{' '}
            {visibleEdges.length}{' '}
            {visibleEdges.length === 1 ? 'connection' : 'connections'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <form
            onSubmit={handleSearchSubmit}
            className="relative min-w-0 max-w-sm flex-1 basis-36"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setSearchOpen(false);
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchNotice('');
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setSearchOpen(false);
                  setQuery('');
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  event.currentTarget.form
                    ?.querySelector<HTMLButtonElement>('[data-search-result]')
                    ?.focus();
                }
              }}
              placeholder="Find a concept or explanation"
              aria-label="Find an idea in the graph"
              aria-describedby={
                searchNotice ? 'graph-search-notice' : undefined
              }
              className="h-8 w-full rounded-full border bg-white pl-8 pr-3 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/50"
            />
            {searchOpen && query.trim() && searchMatches.length > 0 && (
              <ul
                aria-label="Graph search results"
                className="absolute inset-x-0 top-10 z-20 max-h-60 overflow-y-auto rounded-lg border bg-white p-1 shadow-pop"
              >
                {searchMatches.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      data-search-result
                      onClick={() => focusById(node.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          setSearchOpen(false);
                          searchRef.current?.focus();
                        }
                        if (
                          event.key === 'ArrowDown' ||
                          event.key === 'ArrowUp'
                        ) {
                          event.preventDefault();
                          const row = event.currentTarget.closest('li');
                          const next =
                            event.key === 'ArrowDown'
                              ? row?.nextElementSibling
                              : row?.previousElementSibling;
                          if (next)
                            next
                              .querySelector<HTMLButtonElement>('button')
                              ?.focus();
                          else searchRef.current?.focus();
                        }
                      }}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs text-ink hover:bg-black/5 focus:bg-black/5"
                    >
                      <NodeIcon
                        kind={node.nodeKind}
                        className="mt-0.5 size-3.5 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block truncate">{node.title}</span>
                        <span className="mt-0.5 block text-[11px] text-muted">
                          {node.nodeKind === 'concept'
                            ? 'Concept'
                            : 'Explanation'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 rounded-full px-2.5 text-xs"
                aria-label="Graph filters"
              >
                <SlidersHorizontal className="size-3.5" /> Filters
                {filtersActive && (
                  <span
                    className="size-1.5 rounded-full bg-accent"
                    aria-label="Filters active"
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-64 max-w-[calc(100vw-2rem)] p-3"
            >
              <fieldset>
                <legend className="mb-2 text-xs font-medium text-ink">
                  Show nodes
                </legend>
                <div className="flex gap-1">
                  {(['concept', 'explanation'] as const).map((kind) => (
                    <Button
                      key={kind}
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-pressed={kinds.has(kind)}
                      onClick={() => toggleKind(kind)}
                      className={cn(
                        'h-7 gap-1 rounded-full border px-2 text-xs',
                        kinds.has(kind) && 'bg-black/5',
                      )}
                    >
                      <NodeIcon kind={kind} className="size-3" />{' '}
                      {kind === 'concept' ? 'Concepts' : 'Explanations'}
                    </Button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="mt-3 border-t pt-3">
                <legend className="sr-only">Relationship types</legend>
                <p className="mb-1.5 text-xs font-medium">Relationships</p>
                {[...allRelations].map((kind) => (
                  <label
                    key={kind}
                    className="flex cursor-pointer items-center gap-2 py-1.5 text-xs text-ink"
                  >
                    <input
                      type="checkbox"
                      checked={relations.has(kind)}
                      onChange={() => toggleRelation(kind)}
                      className="size-3.5 accent-black"
                    />
                    {RELATION_LABELS[kind]}
                  </label>
                ))}
                {!allRelations.size && (
                  <p className="text-xs text-muted">
                    No connections on this page.
                  </p>
                )}
              </fieldset>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7 px-0 text-xs"
                onClick={() => {
                  setKinds(new Set(['concept', 'explanation']));
                  setRelations(new Set(allRelations));
                }}
              >
                Reset filters
              </Button>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="sm"
            onClick={showAll}
            className="h-8 gap-1 rounded-full px-2 text-xs"
          >
            <RotateCcw className="size-3.5" /> Show all
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1">
            <div
              role="group"
              aria-label="Graph view"
              className="flex gap-0.5 rounded-full bg-black/[0.04] p-0.5"
            >
              <Button
                variant="ghost"
                size="sm"
                disabled={!selectedId}
                aria-pressed={view === 'neighbourhood'}
                onClick={() => {
                  setView('neighbourhood');
                  setDepth(1);
                }}
                className={cn(
                  'h-6 rounded-full px-2 text-[11px]',
                  view === 'neighbourhood' && 'bg-white shadow-sm',
                )}
              >
                Neighbourhood
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={view === 'all'}
                onClick={() => setView('all')}
                className={cn(
                  'h-6 rounded-full px-2 text-[11px]',
                  view === 'all' && 'bg-white shadow-sm',
                )}
              >
                All nodes
              </Button>
            </div>
            {view === 'neighbourhood' && selectedId && (
              <Button
                variant="ghost"
                size="sm"
                disabled={!canExpand}
                onClick={() => setDepth((value) => value + 1)}
                className="h-7 gap-1 rounded-full px-2 text-[11px]"
              >
                <Expand className="size-3" /> Expand connections
              </Button>
            )}
          </div>
          <div
            className="flex items-center gap-0.5"
            role="group"
            aria-label="Graph navigation"
          >
            <ControlButton label="Zoom out" onClick={() => zoomBy(0.74)}>
              <Minus className="size-3.5" />
            </ControlButton>
            <span
              className="w-10 text-center text-[11px] tabular-nums text-muted"
              aria-label="Zoom level"
            >
              {Math.round(zoom * 100)}%
            </span>
            <ControlButton label="Zoom in" onClick={() => zoomBy(1.35)}>
              <Plus className="size-3.5" />
            </ControlButton>
            <ControlButton label="Fit to view" onClick={fitVisible}>
              <Maximize2 className="size-3.5" />
            </ControlButton>
          </div>
        </div>
        {searchNotice && (
          <p
            id="graph-search-notice"
            role="status"
            className="mt-2 text-xs text-muted"
          >
            {searchNotice}
          </p>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          ref={containerRef}
          data-graph-stage
          data-ready={graphReady}
          className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-canvas"
          style={{ cursor: hoverId ? 'pointer' : 'default' }}
        >
          {graphData.nodes.length > 0 && (
            <ForceGraph2D<ApiGraphNode, ApiGraphLink>
              ref={graphRef}
              graphData={graphData}
              width={dimensions.width}
              height={dimensions.height}
              backgroundColor={BACKGROUND}
              onRenderFramePre={paintGrid}
              onRenderFramePost={paintLabels}
              minZoom={0.02}
              maxZoom={4}
              nodeRelSize={4}
              nodeCanvasObjectMode={() => 'replace'}
              nodeCanvasObject={paintNode}
              nodePointerAreaPaint={paintPointerArea}
              nodeLabel={() => ''}
              nodeVisibility={(node) => visibleIds.has(String(node.id))}
              linkVisibility={(link) =>
                relations.has(link.relationType) &&
                visibleIds.has(resolveId(link.source)) &&
                visibleIds.has(resolveId(link.target))
              }
              linkColor={linkColor}
              linkWidth={linkWidth}
              linkLineDash={(link) =>
                link.relationType === 'explains' ? [3, 3] : null
              }
              linkDirectionalArrowLength={(link) =>
                UNDIRECTED.has(link.relationType) ||
                (visibleEdges.length > 80 && !linkActive(link))
                  ? 0
                  : 4
              }
              linkDirectionalArrowRelPos={0.76}
              linkCanvasObjectMode={() => 'after'}
              linkCanvasObject={paintLinkLabel}
              cooldownTicks={0}
              warmupTicks={0}
              onEngineStop={handleEngineStop}
              linkLabel={() => ''}
              onLinkHover={(link) =>
                setHoverLinkId(
                  link
                    ? `${resolveId(link.source)}:${link.relationType}:${resolveId(link.target)}`
                    : null,
                )
              }
              onNodeHover={(node) => setHoverId(node ? String(node.id) : null)}
              onNodeClick={(node) => selectNode(node as GraphNode)}
              onNodeDragEnd={(node) => {
                node.fx = node.x;
                node.fy = node.y;
                saveLayout();
              }}
              onZoom={({ k }) => setZoom(k)}
            />
          )}
          {!graphReady && (
            <div
              role="status"
              className="absolute inset-0 flex items-center justify-center bg-canvas text-xs text-muted"
            >
              Arranging graph…
            </div>
          )}
          {visibleIds.size === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-canvas px-4 text-center">
              <p className="text-sm font-medium">
                No nodes match these filters
              </p>
              <Button variant="outline" size="sm" onClick={showAll}>
                Show all nodes
              </Button>
            </div>
          )}
          <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-white/95 px-2.5 py-1.5 text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <Circle className="size-2.5" /> Concept
            </span>
            <span className="flex items-center gap-1">
              <FileText className="size-2.5" /> Explanation
            </span>
            <span className="hidden sm:inline">
              Drag to move · Scroll to zoom · Hover for labels
            </span>
          </div>
        </div>
        <aside
          aria-label="Node details"
          className={cn(
            'shrink-0 overflow-y-auto border-t bg-white lg:w-72 lg:border-l lg:border-t-0',
            selectedNode ? 'max-h-[40%] lg:max-h-none' : 'hidden',
          )}
        >
          {selectedNode ? (
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <NodeIcon kind={selectedNode.nodeKind} className="size-3.5" />{' '}
                  {selectedNode.nodeKind === 'concept'
                    ? 'Concept'
                    : 'Saved explanation'}
                </span>
                <ControlButton
                  label="Close details"
                  onClick={() => {
                    setSelectedId(null);
                    setView('all');
                  }}
                >
                  <X className="size-3.5" />
                </ControlButton>
              </div>
              <h2 className="text-base font-semibold leading-snug text-ink">
                {selectedNode.title}
              </h2>
              <p className="mt-2 text-xs leading-5 text-muted">
                {selectedNode.summary?.trim() ||
                  'No summary has been written yet.'}
              </p>
              <Button
                asChild
                size="sm"
                className="mt-3 h-7 rounded-full px-2.5 text-xs"
              >
                <Link
                  href={`/${selectedNode.nodeKind === 'concept' ? 'collections' : 'entries'}/${selectedNode.slug}`}
                >
                  {selectedNode.nodeKind === 'concept'
                    ? 'Open concept'
                    : 'Read explanation'}
                  <ArrowUpRight className="size-3" />
                </Link>
              </Button>
              <div className="mt-5 border-t pt-3">
                <p className="mb-3 text-xs font-medium text-ink">
                  Connected ideas
                </p>
                {selectedRelations.length ? (
                  selectedRelations.map((group) => (
                    <div key={group.label} className="mb-3">
                      <h3 className="mb-1 text-[11px] text-muted">
                        {group.label}
                      </h3>
                      <div className="space-y-0.5">
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => focusById(item.id)}
                            className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs leading-5 text-ink hover:bg-black/[0.04]"
                          >
                            <NodeIcon
                              kind={item.nodeKind}
                              className="mt-0.5 size-3 shrink-0"
                            />
                            <span>{item.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs leading-5 text-muted">
                    No connections match the current filters.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="p-5">
              <Network className="mb-3 size-5 text-muted" />
              <h2 className="text-sm font-medium text-ink">
                Explore a connection
              </h2>
              <p className="mt-2 text-xs leading-5 text-muted">
                Select a node or search for an idea to see its explanation and
                connections.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function NodeIcon({
  kind,
  className,
}: {
  kind: ApiGraphNode['nodeKind'];
  className?: string;
}) {
  return kind === 'concept' ? (
    <Circle className={className} aria-hidden="true" />
  ) : (
    <FileText className={className} aria-hidden="true" />
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClick}
          aria-label={label}
          className="size-7 rounded-full text-ink"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from 'react-force-graph-2d';
import { forceCollide } from 'd3-force-3d';
import { ArrowUpRight, Maximize2, Minus, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Graph, GraphLink as ApiGraphLink, GraphNode as ApiGraphNode } from '@/lib/api-types';
import { RELATION_INCOMING_LABELS, RELATION_OUTGOING_LABELS } from '@/lib/relations';

type GraphNode = NodeObject<ApiGraphNode>;
type GraphLink = LinkObject<ApiGraphNode, ApiGraphLink>;
type GraphMethods = ForceGraphMethods<GraphNode, GraphLink>;

export interface KnowledgeGraphProps {
  data: Graph;
}

// Canvas can't read CSS variables, so this palette mirrors the tokens in globals.css.
const BACKGROUND = '#fafafa'; // --canvas
const GRID_DOT = 'rgba(0, 0, 0, 0.05)';
const NODE_HALO = '#fafafa'; // gap that lifts a node off crossing links — matches BACKGROUND
const LABEL_INK = '#666666'; // --muted
const LABEL_INK_FOCUS = '#171717'; // --ink
const LABEL_HALO = 'rgba(250, 250, 250, 0.92)'; // keeps text crisp over edges
const LINK_BASE = 'rgba(115, 115, 115, 0.25)';
const LINK_ACTIVE = 'rgba(46, 74, 133, 0.7)'; // --accent
const LINK_DIM = 'rgba(115, 115, 115, 0.06)';
const RING = 'rgba(46, 74, 133, 0.95)'; // --accent
const GLOW = 'rgba(46, 74, 133, 0.3)'; // soft halo under the focused node
const DIM_ALPHA = 0.12; // out-of-focus nodes on hover or collection focus — faint, never gone

const HUB_LABELS = 8; // the N most-connected nodes keep their labels at any zoom
const LABEL_FADE_START = 1.05; // zoom where every label starts fading in…
const LABEL_FADE_END = 1.6; // …and where it reaches full strength
const LABEL_FONT = 11.5; // px on screen, constant across zoom
const LABEL_MAX_CHARS = 36;

const GRID_SPACING = 36; // graph units between ground dots
const GRID_MIN_PX = 18; // spacing doubles until dots sit at least this far apart on screen

function resolveId(end: GraphLink['source']): string {
  return typeof end === 'object' && end !== null ? String((end as GraphNode).id) : String(end);
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

  const [dimensions, setDimensions] = React.useState({ width: 800, height: 600 });
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [focusedConcept, setFocusedConcept] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');

  // The engine mutates x/y onto these node objects in place, so they must be copies the parent
  // never re-creates — otherwise every render would restart the layout.
  const graphData = React.useMemo(
    () => ({ nodes: data.nodes.map((n) => ({ ...n })), links: data.links.map((l) => ({ ...l })) }),
    [data.nodes, data.links]
  );

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

  const legend = React.useMemo(() => {
    const counts = new Map<string, { color: string; count: number }>();
    for (const node of data.nodes) {
      const entry = counts.get(node.conceptName);
      if (entry) entry.count += 1;
      else counts.set(node.conceptName, { color: node.conceptColor, count: 1 });
    }
    return [...counts.entries()].map(([name, { color, count }]) => ({ name, color, count }));
  }, [data.nodes]);

  const radiusFor = React.useCallback(
    (id: string) => Math.min(11, 3.5 + Math.sqrt(degree.get(id) ?? 0) * 1.5),
    [degree]
  );

  // Fill the container and track resizes. Guarded so an unchanged size never re-renders.
  React.useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(320, Math.floor(entry.contentRect.width));
      const height = Math.max(320, Math.floor(entry.contentRect.height));
      setDimensions((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height }
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A calm, roomy layout: nodes repel, links pull short and even, and a collision
  // radius keeps circles (and their labels) from piling onto each other.
  React.useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.d3Force('charge')?.strength(-110);
    graph.d3Force('link')?.distance(50);
    graph.d3Force(
      'collide',
      forceCollide((node) => radiusFor(String(node.id)) + 4)
    );
  }, [graphData, radiusFor]);

  // Frame the whole graph once, when it first settles. The camera is the reader's after that.
  const hasFramed = React.useRef(false);
  const handleEngineStop = React.useCallback(() => {
    if (hasFramed.current) return;
    hasFramed.current = true;
    graphRef.current?.zoomToFit(500, 70);
  }, []);

  const neighbors = hoverId ? adjacency.get(hoverId) : undefined;

  const isConceptDimmed = React.useCallback(
    (conceptName: string) => focusedConcept != null && conceptName !== focusedConcept,
    [focusedConcept]
  );

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
      const bottomRight = graph.screen2GraphCoords(dimensions.width, dimensions.height);
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
    [dimensions]
  );

  // Canvas accessors are rendering-only in 2D (no persistent scene objects, no engine
  // reheat), so reading hover/selection straight from state here is safe and just repaints.
  const paintNode = React.useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, scale: number) => {
      if (node.x == null || node.y == null) return;
      const id = String(node.id);
      const r = radiusFor(id);
      const focused = id === hoverId || id === selectedId;
      const inHoverFocus = hoverId == null || focused || (neighbors?.has(id) ?? false);
      const dimmed = !inHoverFocus || isConceptDimmed(node.conceptName);

      ctx.globalAlpha = dimmed ? DIM_ALPHA : 1;

      if (focused) {
        ctx.shadowColor = GLOW;
        ctx.shadowBlur = 14;
      }

      // A thin background-coloured halo, then the filled circle — the clean node look.
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 0.7, 0, 2 * Math.PI);
      ctx.fillStyle = NODE_HALO;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = node.conceptColor;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (focused) {
        ctx.lineWidth = 1.6 / scale;
        ctx.strokeStyle = RING;
        ctx.stroke();
      }

      // Labels come to you: hubs always, neighbours on hover, everything as you zoom in.
      let alpha = Math.min(
        1,
        Math.max(0, (scale - LABEL_FADE_START) / (LABEL_FADE_END - LABEL_FADE_START))
      );
      if (focused || (hoverId != null && inHoverFocus)) alpha = 1;
      else if (hubIds.has(id)) alpha = Math.max(alpha, 0.9);

      if (alpha > 0.02 && !dimmed) {
        const fontSize = LABEL_FONT / scale;
        ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.globalAlpha = alpha;
        const label = truncate(node.title, LABEL_MAX_CHARS);
        const y = node.y + r + 3 / scale;
        ctx.lineWidth = 3 / scale;
        ctx.strokeStyle = LABEL_HALO;
        ctx.strokeText(label, node.x, y);
        ctx.fillStyle = focused ? LABEL_INK_FOCUS : LABEL_INK;
        ctx.fillText(label, node.x, y);
      }

      ctx.globalAlpha = 1;
    },
    [radiusFor, hoverId, selectedId, neighbors, hubIds, isConceptDimmed]
  );

  // The clickable/hoverable area matches the drawn circle (plus a small forgiving margin).
  const paintPointerArea = React.useCallback(
    (node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
      if (node.x == null || node.y == null) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radiusFor(String(node.id)) + 2, 0, 2 * Math.PI);
      ctx.fill();
    },
    [radiusFor]
  );

  const linkActive = React.useCallback(
    (link: GraphLink) =>
      hoverId != null && (resolveId(link.source) === hoverId || resolveId(link.target) === hoverId),
    [hoverId]
  );

  const linkColor = React.useCallback(
    (link: GraphLink) => {
      if (focusedConcept != null) {
        const s = nodeById.get(resolveId(link.source));
        const t = nodeById.get(resolveId(link.target));
        if (s?.conceptName !== focusedConcept && t?.conceptName !== focusedConcept)
          return LINK_DIM;
      }
      if (hoverId == null) return LINK_BASE;
      return linkActive(link) ? LINK_ACTIVE : LINK_DIM;
    },
    [hoverId, linkActive, focusedConcept, nodeById]
  );

  const linkWidth = React.useCallback(
    (link: GraphLink) => (hoverId != null && linkActive(link) ? 1.8 : 1),
    [hoverId, linkActive]
  );

  // Only ever recenters — zoom stays entirely the reader's, changed nowhere but the controls.
  const selectNode = React.useCallback((node: GraphNode) => {
    setSelectedId(String(node.id));
    const graph = graphRef.current;
    if (graph && node.x != null && node.y != null) graph.centerAt(node.x, node.y, 600);
  }, []);

  const focusById = React.useCallback(
    (id: string) => {
      const node = graphData.nodes.find((n) => String(n.id) === id) as GraphNode | undefined;
      if (node) selectNode(node);
    },
    [graphData, selectNode]
  );

  const zoomBy = (factor: number) => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.zoom(graph.zoom() * factor, 250);
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = data.nodes.find((node) => node.title.toLowerCase().includes(q));
    if (hit) focusById(hit.id);
  };

  const selectedNode = selectedId ? (nodeById.get(selectedId) ?? null) : null;

  const selectedRelations = React.useMemo(() => {
    if (!selectedId) return [] as Array<{ label: string; items: ApiGraphNode[] }>;
    const groups = new Map<string, ApiGraphNode[]>();
    const push = (label: string, id: string) => {
      const node = nodeById.get(id);
      if (!node) return;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(node);
    };
    for (const link of data.links) {
      const s = resolveId(link.source);
      const t = resolveId(link.target);
      if (s === selectedId) push(RELATION_OUTGOING_LABELS[link.relationType], t);
      else if (t === selectedId) {
        const label = RELATION_INCOMING_LABELS[link.relationType];
        if (label) push(label, s);
      }
    }
    return [...groups.entries()].map(([label, items]) => ({ label, items }));
  }, [selectedId, data.links, nodeById]);

  const glass = 'rounded-card border bg-surface/90 shadow-card backdrop-blur-md';

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-canvas"
      style={{ cursor: hoverId ? 'pointer' : 'default' }}
    >
      <ForceGraph2D<ApiGraphNode, ApiGraphLink>
        ref={graphRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor={BACKGROUND}
        onRenderFramePre={paintGrid}
        nodeRelSize={4}
        nodeCanvasObjectMode={() => 'replace'}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={paintPointerArea}
        linkColor={linkColor}
        linkWidth={linkWidth}
        cooldownTicks={160}
        onEngineStop={handleEngineStop}
        onNodeHover={(node) => setHoverId(node ? String(node.id) : null)}
        onNodeClick={(node) => selectNode(node as GraphNode)}
        onBackgroundClick={() => setSelectedId(null)}
      />

      {/* Top-left: title + search */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
        <div className={`pointer-events-auto px-3.5 py-2 ${glass}`}>
          <h1 className="text-sm font-semibold leading-none tracking-[-0.01em] text-ink">Graph</h1>
          <p className="mt-1 text-[12px] leading-none text-faint">
            {data.nodes.length} entries · {data.links.length} relations
          </p>
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className={`pointer-events-auto relative ${glass} !rounded-full`}
        >
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find an entry"
            className="h-9 w-44 rounded-full bg-transparent pl-9 pr-4 text-[13px] text-ink placeholder:text-faint focus:outline-none lg:w-56"
          />
        </form>
      </div>

      {/* Bottom-left: the legend, and a quiet filter — click a collection to spotlight it. */}
      {legend.length > 0 && (
        <div className={`absolute bottom-3 left-3 px-2 py-2 ${glass}`}>
          <p className="mb-1 px-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
            Collections
          </p>
          <ul className="flex flex-col">
            {legend.map((item) => {
              const active = focusedConcept === item.name;
              return (
                <li key={item.name}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFocusedConcept(active ? null : item.name)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-[7px] px-1.5 py-1 text-left text-[12px] transition-colors duration-[var(--dur-fast)]',
                      active ? 'bg-surface-soft text-ink' : 'text-muted hover:text-ink',
                      focusedConcept != null && !active && 'opacity-50'
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="max-w-[11rem] truncate">{item.name}</span>
                    <span className="ml-auto pl-2 font-mono text-[10px] tabular-nums text-faint">
                      {item.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Bottom-right: zoom cluster */}
      <div className={`absolute bottom-3 right-3 flex items-center gap-0.5 p-1 ${glass} !rounded-full`}>
        <ControlButton label="Zoom in" onClick={() => zoomBy(1.35)}>
          <Plus className="h-4 w-4" />
        </ControlButton>
        <ControlButton label="Zoom out" onClick={() => zoomBy(0.74)}>
          <Minus className="h-4 w-4" />
        </ControlButton>
        <ControlButton label="Fit to view" onClick={() => graphRef.current?.zoomToFit(500, 70)}>
          <Maximize2 className="h-4 w-4" />
        </ControlButton>
      </div>

      {/* Right: inspector */}
      {selectedNode && (
        <aside
          className={`absolute inset-x-3 bottom-3 max-h-[55%] overflow-auto p-4 !shadow-pop sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[calc(100%-1.5rem)] sm:w-[340px] ${glass}`}
        >
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            aria-label="Close"
            className="absolute right-3 top-3 rounded-md p-1 text-faint transition-colors hover:bg-surface-soft hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mb-1.5 flex items-center gap-2 pr-7">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: selectedNode.conceptColor }}
            />
            <span className="truncate text-[13px] text-faint">{selectedNode.conceptName}</span>
          </div>

          <h2 className="text-[16px] font-semibold leading-snug tracking-[-0.01em] text-ink">
            {selectedNode.title}
          </h2>

          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            {selectedNode.summary?.trim() || 'No summary has been written yet.'}
          </p>

          {selectedRelations.length > 0 && (
            <div className="mt-4 space-y-3 border-t pt-4">
              {selectedRelations.map((group) => (
                <div key={group.label}>
                  <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => focusById(item.id)}
                        className="max-w-full truncate rounded-full border bg-surface px-2.5 py-1 text-[12px] text-ink transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-accent"
                      >
                        {item.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Link
            href={`/entries/${selectedNode.slug}`}
            className="focus-ring mt-4 flex h-8 items-center justify-center gap-1.5 rounded-full border bg-surface text-[13px] font-medium text-ink transition-colors hover:bg-surface-soft"
          >
            Open entry
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </aside>
      )}
    </div>
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
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-full p-2 text-muted transition-colors hover:bg-surface-soft hover:text-ink"
    >
      {children}
    </button>
  );
}

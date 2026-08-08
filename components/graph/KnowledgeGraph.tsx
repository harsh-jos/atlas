'use client';

import * as React from 'react';
import Link from 'next/link';
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from 'react-force-graph-2d';
import { ArrowUpRight, Maximize2, Minus, Plus, Search, X } from 'lucide-react';
import type { Graph, GraphLink as ApiGraphLink, GraphNode as ApiGraphNode } from '@/lib/api-types';
import { RELATION_INCOMING_LABELS, RELATION_OUTGOING_LABELS } from '@/lib/relations';

type GraphNode = NodeObject<ApiGraphNode>;
type GraphLink = LinkObject<ApiGraphNode, ApiGraphLink>;
type GraphMethods = ForceGraphMethods<GraphNode, GraphLink>;

export interface KnowledgeGraphProps {
  data: Graph;
}

// A single, deliberately light palette — Obsidian's graph in a bright room, never a dark one.
// Canvas can't read CSS variables, so these mirror the tokens in globals.css.
const BACKGROUND = '#fafafa'; // --canvas
const LABEL_INK = '#666666'; // --muted
const LABEL_INK_FOCUS = '#171717'; // --ink
const LINK_BASE = 'rgba(115, 115, 115, 0.28)';
const LINK_ACTIVE = 'rgba(37, 99, 235, 0.75)'; // --accent
const LINK_DIM = 'rgba(115, 115, 115, 0.08)';
const RING = 'rgba(37, 99, 235, 0.95)'; // --accent
const NODE_HALO = '#fafafa'; // thin gap that lifts a node off crossing links — matches BACKGROUND
const DIM_ALPHA = 0.16; // how faint an out-of-focus node goes on hover (never invisible)
const LABEL_ZOOM = 1.15; // labels fade in once the reader has zoomed in past this
const LABEL_FONT = 12; // px at zoom 1, kept constant on screen by dividing by scale

function resolveId(end: GraphLink['source']): string {
  return typeof end === 'object' && end !== null ? String((end as GraphNode).id) : String(end);
}

export function KnowledgeGraph({ data }: KnowledgeGraphProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const graphRef = React.useRef<GraphMethods | undefined>(undefined);

  const [dimensions, setDimensions] = React.useState({ width: 800, height: 600 });
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
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

  // Degree drives node size; adjacency drives the hover neighbourhood highlight.
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

  // A calm, roomy layout: nodes repel, links pull to a short, even distance.
  React.useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.d3Force('charge')?.strength(-95);
    graph.d3Force('link')?.distance(46);
  }, [graphData]);

  // Frame the whole graph once, when it first settles. Zoom is the reader's after that — nothing
  // ever moves the camera on its own again.
  const hasFramed = React.useRef(false);
  const handleEngineStop = React.useCallback(() => {
    if (hasFramed.current) return;
    hasFramed.current = true;
    graphRef.current?.zoomToFit(500, 70);
  }, []);

  const neighbors = hoverId ? adjacency.get(hoverId) : undefined;

  const linkActive = React.useCallback(
    (link: GraphLink) =>
      hoverId != null && (resolveId(link.source) === hoverId || resolveId(link.target) === hoverId),
    [hoverId]
  );

  // Canvas accessors are rendering-only in 2D (no persistent scene objects, no engine reheat),
  // so reading hover/selection straight from state here is safe and just repaints.
  const paintNode = React.useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, scale: number) => {
      if (node.x == null || node.y == null) return;
      const id = String(node.id);
      const r = radiusFor(id);
      const focused = id === hoverId || id === selectedId;
      const inFocus = hoverId == null || focused || (neighbors?.has(id) ?? false);

      ctx.globalAlpha = inFocus ? 1 : DIM_ALPHA;

      // A thin background-coloured halo, then the filled circle — Obsidian's clean node look.
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 0.7, 0, 2 * Math.PI);
      ctx.fillStyle = NODE_HALO;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = node.conceptColor;
      ctx.fill();

      if (focused) {
        ctx.lineWidth = 1.6 / scale;
        ctx.strokeStyle = RING;
        ctx.stroke();
      }

      const showLabel = focused || scale > LABEL_ZOOM || (hoverId != null && inFocus);
      if (showLabel) {
        const fontSize = LABEL_FONT / scale;
        ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = focused ? LABEL_INK_FOCUS : LABEL_INK;
        ctx.fillText(node.title, node.x, node.y + r + 2 / scale);
      }

      ctx.globalAlpha = 1;
    },
    [radiusFor, hoverId, selectedId, neighbors]
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

  const linkColor = React.useCallback(
    (link: GraphLink) => {
      if (hoverId == null) return LINK_BASE;
      return linkActive(link) ? LINK_ACTIVE : LINK_DIM;
    },
    [hoverId, linkActive]
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

  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null;

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

  const legend = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const node of data.nodes) {
      if (!seen.has(node.conceptName)) seen.set(node.conceptName, node.conceptColor);
    }
    return [...seen.entries()].map(([name, color]) => ({ name, color }));
  }, [data.nodes]);

  const panel = 'rounded-[12px] border bg-surface/85 shadow-card backdrop-blur-md';

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-canvas">
      <ForceGraph2D<ApiGraphNode, ApiGraphLink>
        ref={graphRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor={BACKGROUND}
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
        <div className={`pointer-events-auto px-3.5 py-2 ${panel}`}>
          <h1 className="text-sm font-semibold leading-none tracking-[-0.01em] text-ink">
            Graph
          </h1>
          <p className="mt-1 text-[12px] leading-none text-faint">
            {data.nodes.length} entries · {data.links.length} relations
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className={`pointer-events-auto relative ${panel}`}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find an entry"
            className="h-9 w-44 rounded-[12px] bg-transparent pl-9 pr-3 text-[13px] text-ink placeholder:text-faint focus:outline-none lg:w-56"
          />
        </form>
      </div>

      {/* Bottom-left: the legend only. Controls live on the right edge, away from the
          navigation rail this corner sits against. */}
      {legend.length > 0 && (
        <div className={`absolute bottom-3 left-3 px-3 py-2.5 ${panel}`}>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
            Collections
          </p>
          <ul className="flex flex-col gap-1">
            {legend.map((item) => (
              <li key={item.name} className="flex items-center gap-2 text-[12px] text-muted">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate">{item.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Bottom-right: zoom controls, above whatever the page stacks below them. */}
      <div className={`absolute bottom-3 right-3 flex items-center gap-1 p-1 ${panel}`}>
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

      {/* Right: detail panel */}
      {selectedNode && (
        <aside
          className={`absolute inset-x-3 bottom-3 max-h-[55%] overflow-auto p-4 shadow-card-hover sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[calc(100%-1.5rem)] sm:w-[340px] ${panel}`}
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
            <span className="truncate font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
              {selectedNode.conceptName}
            </span>
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
                  <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => focusById(item.id)}
                        className="max-w-full truncate rounded-full border bg-surface px-2.5 py-1 text-[12px] text-ink transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
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
            className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-accent transition-colors hover:text-ink"
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
      className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-soft hover:text-ink"
    >
      {children}
    </button>
  );
}

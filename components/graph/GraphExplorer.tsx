'use client';

import * as React from 'react';
import Link from 'next/link';
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from 'react-force-graph-2d';
import { ArrowUpRight, Maximize2, Minus, Plus, Search, X } from 'lucide-react';
import type { KnowledgeGraphData, KnowledgeGraphLink, KnowledgeGraphNode } from '@/lib/graph-data';
import { RELATION_COLORS, RELATION_INCOMING_LABELS, RELATION_OUTGOING_LABELS } from '@/lib/relations';

type GraphNode = NodeObject<KnowledgeGraphNode>;
type GraphLink = LinkObject<KnowledgeGraphNode, KnowledgeGraphLink>;

export interface GraphExplorerProps {
  data: KnowledgeGraphData;
}

// Palette pulled from the design tokens so the canvas matches the rest of the app.
const FALLBACK_PALETTE = {
  ink: '#090c1d',
  faint: '#7c828d',
  hairline: '#d9d9d9',
  accent: '#7b68ee',
  surfaceSoft: '#f8f9fa',
};

// Resolve design tokens to concrete colors (canvas can't read CSS vars). Runs in
// the browser only — GraphExplorer is loaded with ssr: false.
function readPalette() {
  if (typeof document === 'undefined') return FALLBACK_PALETTE;
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  return {
    ink: read('--ink', FALLBACK_PALETTE.ink),
    faint: read('--faint', FALLBACK_PALETTE.faint),
    hairline: read('--hairline-strong', FALLBACK_PALETTE.hairline),
    accent: read('--accent', FALLBACK_PALETTE.accent),
    surfaceSoft: read('--surface-soft', FALLBACK_PALETTE.surfaceSoft),
  };
}

function resolveId(end: GraphLink['source']): string {
  return typeof end === 'object' && end !== null ? String((end as GraphNode).id) : String(end);
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Mix a hex color toward white — used for the lit core of a node's sphere gradient.
function lighten(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export function GraphExplorer({ data }: GraphExplorerProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const graphRef = React.useRef<
    ForceGraphMethods<KnowledgeGraphNode, KnowledgeGraphLink> | undefined
  >(undefined);

  const [dimensions, setDimensions] = React.useState({ width: 800, height: 600 });
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [palette] = React.useState(readPalette);

  const graphData = React.useMemo(
    () => ({ nodes: data.nodes, links: data.links }),
    [data.nodes, data.links]
  );

  // Fill the container, tracking resizes.
  React.useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setDimensions({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(320, Math.floor(entry.contentRect.height)),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const nodeById = React.useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const node of data.nodes) map.set(node.id, node as GraphNode);
    return map;
  }, [data.nodes]);

  // Adjacency + degree, computed once from the link list.
  const { adjacency, degree, hubIds } = React.useMemo(() => {
    const adj = new Map<string, Set<string>>();
    const deg = new Map<string, number>();
    const bump = (id: string) => deg.set(id, (deg.get(id) ?? 0) + 1);
    const link = (a: string, b: string) => {
      if (!adj.has(a)) adj.set(a, new Set());
      adj.get(a)!.add(b);
    };

    for (const edge of data.links) {
      const s = resolveId(edge.source);
      const t = resolveId(edge.target);
      link(s, t);
      link(t, s);
      bump(s);
      bump(t);
    }

    // The handful of highest-degree nodes keep their labels in the overview.
    const hubs = new Set(
      [...deg.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id]) => id)
    );

    return { adjacency: adj, degree: deg, hubIds: hubs };
  }, [data.links]);

  const focusId = hoverId ?? selectedId;

  const neighborIds = React.useMemo(() => {
    if (!focusId) return null;
    return adjacency.get(focusId) ?? new Set<string>();
  }, [focusId, adjacency]);

  const matchedIds = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const matches = new Set<string>();
    for (const node of data.nodes) {
      if (node.title.toLowerCase().includes(q)) matches.add(node.id);
    }
    return matches;
  }, [query, data.nodes]);

  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null;

  // Relations of the selected node, grouped by label, for the detail panel.
  const selectedRelations = React.useMemo(() => {
    if (!selectedId) return [] as Array<{ label: string; items: GraphNode[] }>;

    const groups = new Map<string, GraphNode[]>();
    const push = (label: string, id: string) => {
      const node = nodeById.get(id);
      if (!node) return;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(node);
    };

    for (const edge of data.links) {
      const s = resolveId(edge.source);
      const t = resolveId(edge.target);
      if (s === selectedId) {
        push(RELATION_OUTGOING_LABELS[edge.relationType], t);
      } else if (t === selectedId) {
        const label = RELATION_INCOMING_LABELS[edge.relationType];
        if (label) push(label, s);
      }
    }

    return [...groups.entries()].map(([label, items]) => ({ label, items }));
  }, [selectedId, data.links, nodeById]);

  const focusNode = React.useCallback(
    (id: string) => {
      setSelectedId(id);
      const node = nodeById.get(id);
      const graph = graphRef.current;
      if (graph && node && node.x != null && node.y != null) {
        graph.centerAt(node.x, node.y, 600);
        graph.zoom(Math.max(graph.zoom(), 2.4), 600);
      }
    },
    [nodeById]
  );

  const handleEngineStop = React.useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.zoomToFit(500, 70);
    window.setTimeout(() => {
      const g = graphRef.current;
      if (g && g.zoom() > 2.5) g.zoom(2.5, 400);
    }, 550);
  }, []);

  function zoomBy(factor: number) {
    const graph = graphRef.current;
    if (!graph) return;
    graph.zoom(graph.zoom() * factor, 250);
  }

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = data.nodes.find((node) => node.title.toLowerCase().includes(q));
    if (hit) focusNode(hit.id);
  }

  const radiusFor = React.useCallback(
    (id: string) => Math.min(9, 2.4 + Math.sqrt(degree.get(id) ?? 0) * 0.9),
    [degree]
  );

  const paintNode = React.useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const id = String(node.id);
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const radius = radiusFor(id);

      const isFocus = id === focusId;
      const isNeighbor = neighborIds?.has(id) ?? false;
      const isMatch = matchedIds?.has(id) ?? false;

      const dimmed =
        (focusId != null && !isFocus && !isNeighbor) ||
        (matchedIds != null && !isMatch && focusId == null);

      // Dimmed nodes stay flat and cheap — they fade into the background.
      if (dimmed) {
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = node.collectionColor;
        ctx.fill();
        ctx.lineWidth = 1 / scale;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.globalAlpha = 1;
        return;
      }

      ctx.globalAlpha = 1;

      // Soft, pulsing accent glow around the focused node. The focused link's
      // directional particles keep the render loop alive, so this animates.
      if (isFocus) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 600);
        const glowRadius = radius + (5 + pulse * 4) / scale;
        const glow = ctx.createRadialGradient(x, y, radius * 0.6, x, y, glowRadius);
        glow.addColorStop(0, withAlpha(palette.accent, 0.32));
        glow.addColorStop(1, withAlpha(palette.accent, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, glowRadius, 0, 2 * Math.PI);
        ctx.fill();
      }

      // Lift the active subset (focus + neighbours) off the canvas with a shadow.
      // Kept off the ambient nodes so large graphs stay light to paint.
      const lifted = isFocus || isNeighbor;
      if (lifted) {
        ctx.shadowColor = withAlpha(palette.ink, 0.22);
        ctx.shadowBlur = radius * 1.1;
        ctx.shadowOffsetY = radius * 0.25;
      }

      // Radial gradient (lit toward the top-left) gives each node a spherical feel.
      const fill = ctx.createRadialGradient(
        x - radius * 0.35,
        y - radius * 0.35,
        radius * 0.1,
        x,
        y,
        radius
      );
      fill.addColorStop(0, lighten(node.collectionColor, 0.5));
      fill.addColorStop(1, node.collectionColor);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = fill;
      ctx.fill();

      // Clear the shadow before the crisp stroke and labels.
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      ctx.lineWidth = (isFocus ? 1.8 : 1) / scale;
      ctx.strokeStyle = isFocus ? palette.accent : '#ffffff';
      ctx.stroke();

      const showLabel =
        isFocus || isNeighbor || isMatch || hubIds.has(id) || scale > 1.9;

      if (showLabel) {
        const fontSize = 12 / scale;
        const label = node.title.length > 42 ? `${node.title.slice(0, 41)}…` : node.title;
        ctx.font = `500 ${fontSize}px var(--font-inter), system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const labelY = y + radius + 3 / scale;
        // White halo keeps the label legible over edges.
        ctx.lineWidth = 3 / scale;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.strokeText(label, x, labelY);
        ctx.fillStyle = isFocus ? palette.ink : palette.faint;
        ctx.fillText(label, x, labelY);
      }

      ctx.globalAlpha = 1;
    },
    [focusId, neighborIds, matchedIds, hubIds, palette, radiusFor]
  );

  const paintPointerArea = React.useCallback(
    (node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radiusFor(String(node.id)) + 4, 0, 2 * Math.PI);
      ctx.fill();
    },
    [radiusFor]
  );

  const linkTouchesFocus = React.useCallback(
    (link: GraphLink) =>
      focusId != null &&
      (resolveId(link.source) === focusId || resolveId(link.target) === focusId),
    [focusId]
  );

  // A barely-there radial vignette so the full-bleed canvas reads as a space, not a
  // void. Painted in device pixels (reset transform) so it stays fixed under pan/zoom.
  const paintBackground = React.useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const { canvas } = ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const w = canvas.width;
      const h = canvas.height;
      const grad = ctx.createRadialGradient(
        w / 2,
        h * 0.42,
        Math.min(w, h) * 0.15,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.72
      );
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, palette.surfaceSoft);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    },
    [palette]
  );

  const collectionLegend = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const node of data.nodes) {
      if (!seen.has(node.collectionName)) seen.set(node.collectionName, node.collectionColor);
    }
    return [...seen.entries()].map(([name, color]) => ({ name, color }));
  }, [data.nodes]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-canvas">
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#ffffff"
        onRenderFramePre={paintBackground}
        nodeId="id"
        nodeRelSize={5}
        nodeLabel={() => ''}
        nodeCanvasObjectMode={() => 'replace'}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={paintPointerArea}
        linkCurvature={0.15}
        linkColor={(link) => {
          const base = RELATION_COLORS[link.relationType] ?? palette.faint;
          if (focusId != null) {
            return linkTouchesFocus(link) ? base : withAlpha(palette.hairline, 0.5);
          }
          if (matchedIds != null) {
            const lit = matchedIds.has(resolveId(link.source)) || matchedIds.has(resolveId(link.target));
            return lit ? withAlpha(base, 0.6) : withAlpha(palette.hairline, 0.35);
          }
          return withAlpha(base, 0.16);
        }}
        linkWidth={(link) => (focusId != null && linkTouchesFocus(link) ? 1.6 : 0.5)}
        linkDirectionalArrowLength={(link) => (focusId != null && linkTouchesFocus(link) ? 3.2 : 0)}
        linkDirectionalArrowRelPos={1}
        linkDirectionalParticles={(link) => (focusId != null && linkTouchesFocus(link) ? 2 : 0)}
        linkDirectionalParticleWidth={1.8}
        linkDirectionalParticleColor={(link) => RELATION_COLORS[link.relationType] ?? palette.faint}
        cooldownTicks={90}
        warmupTicks={40}
        onEngineStop={handleEngineStop}
        onNodeHover={(node) => setHoverId(node ? String(node.id) : null)}
        onNodeClick={(node) => focusNode(String(node.id))}
        onBackgroundClick={() => setSelectedId(null)}
      />

      {/* Top-left: title + search */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
        <div className="pointer-events-auto rounded-[12px] border-thin bg-surface/85 px-3.5 py-2 shadow-card backdrop-blur-md">
          <h1 className="font-display text-[15px] font-bold leading-none tracking-[-0.02em] text-ink">
            Graph
          </h1>
          <p className="mt-1 text-[12px] leading-none text-faint">
            {data.nodes.length} entries · {data.links.length} relations
          </p>
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className="pointer-events-auto relative rounded-[12px] border-thin bg-surface/85 shadow-card backdrop-blur-md"
        >
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

      {/* Bottom-left: legend + zoom controls */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-2">
        {collectionLegend.length > 0 && (
          <div className="rounded-[12px] border-thin bg-surface/85 px-3 py-2.5 shadow-card backdrop-blur-md">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
              Collections
            </p>
            <ul className="flex flex-col gap-1">
              {collectionLegend.map((item) => (
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

        <div className="flex items-center gap-1 self-start rounded-[12px] border-thin bg-surface/85 p-1 shadow-card backdrop-blur-md">
          <ControlButton label="Zoom in" onClick={() => zoomBy(1.4)}>
            <Plus className="h-4 w-4" />
          </ControlButton>
          <ControlButton label="Zoom out" onClick={() => zoomBy(0.7)}>
            <Minus className="h-4 w-4" />
          </ControlButton>
          <ControlButton label="Fit to view" onClick={() => graphRef.current?.zoomToFit(500, 70)}>
            <Maximize2 className="h-4 w-4" />
          </ControlButton>
        </div>
      </div>

      {/* Right: detail panel for the selected node */}
      {selectedNode && (
        <aside className="absolute inset-x-3 bottom-3 max-h-[55%] overflow-auto rounded-[12px] border-thin bg-surface/95 p-4 shadow-card-hover backdrop-blur-md sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[calc(100%-1.5rem)] sm:w-[340px]">
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
              style={{ backgroundColor: selectedNode.collectionColor }}
            />
            <span className="truncate text-[12px] text-faint">{selectedNode.collectionName}</span>
          </div>

          <h2 className="font-display text-[18px] font-bold leading-snug tracking-[-0.02em] text-ink">
            {selectedNode.title}
          </h2>

          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            {selectedNode.summary?.trim() || 'No summary has been written yet.'}
          </p>

          {selectedRelations.length > 0 && (
            <div className="mt-4 space-y-3 border-t-thin pt-4">
              {selectedRelations.map((group) => (
                <div key={group.label}>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => focusNode(item.id)}
                        className="max-w-full truncate rounded-full border-thin bg-surface px-2.5 py-1 text-[12px] text-body transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
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
            className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-accent transition-colors hover:text-accent-hover"
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

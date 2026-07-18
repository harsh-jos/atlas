'use client';

import * as React from 'react';
import Link from 'next/link';
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import ForceGraph3D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from 'react-force-graph-3d';
import { ArrowUpRight, Maximize2, Minus, Plus, Search, X } from 'lucide-react';
import type { KnowledgeGraphData, KnowledgeGraphLink, KnowledgeGraphNode } from '@/lib/graph-data';
import {
  RELATION_COLORS,
  RELATION_INCOMING_LABELS,
  RELATION_OUTGOING_LABELS,
} from '@/lib/relations';

type GraphNode = NodeObject<KnowledgeGraphNode>;
type GraphLink = LinkObject<KnowledgeGraphNode, KnowledgeGraphLink>;

export interface KnowledgeGraph3DProps {
  data: KnowledgeGraphData;
}

// Editorial-light palette — a bright, calm space rather than Obsidian's black.
const BACKGROUND = '#f5f6fa';
const LABEL_INK = '#3a3f4b';
const LABEL_INK_FOCUS = '#090c1d';
const LINK_BASE = '#9aa0af';
const DIM = 0.12; // opacity of everything not in focus
const FLY_DISTANCE = 90; // camera stand-off when focusing a node

function resolveId(end: GraphLink['source']): string {
  return typeof end === 'object' && end !== null ? String((end as GraphNode).id) : String(end);
}

export function KnowledgeGraph3D({ data }: KnowledgeGraph3DProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const graphRef = React.useRef<ForceGraphMethods<KnowledgeGraphNode, KnowledgeGraphLink>>(undefined);
  // Live handles to each node's material + label so we can dim on hover
  // without regenerating the scene.
  const objects = React.useRef(
    new Map<string, { material: THREE.SpriteMaterial; label: HTMLDivElement }>()
  );

  // A single crisp circle texture, tinted per node — flat billboarded circles
  // (like Obsidian) instead of shaded spheres, which read softer and heavier.
  const [circleTexture] = React.useState<THREE.Texture | null>(() => {
    if (typeof document === 'undefined') return null;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  });

  // Labels are DOM (CSS2D), not WebGL sprites — they render at the display's
  // native resolution, so text stays crisp on Retina and constant in size.
  const [cssRenderer] = React.useState<CSS2DRenderer | null>(() => {
    if (typeof document === 'undefined') return null;
    const renderer = new CSS2DRenderer();
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.pointerEvents = 'none';
    return renderer;
  });

  const [dimensions, setDimensions] = React.useState({ width: 800, height: 600 });
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');

  const graphData = React.useMemo(
    () => ({ nodes: data.nodes.map((n) => ({ ...n })), links: data.links.map((l) => ({ ...l })) }),
    [data.nodes, data.links]
  );

  const nodeById = React.useMemo(() => {
    const map = new Map<string, KnowledgeGraphNode>();
    for (const node of data.nodes) map.set(node.id, node);
    return map;
  }, [data.nodes]);

  const { adjacency, degree } = React.useMemo(() => {
    const adj = new Map<string, Set<string>>();
    const deg = new Map<string, number>();
    const bump = (id: string) => deg.set(id, (deg.get(id) ?? 0) + 1);
    const connect = (a: string, b: string) => {
      if (!adj.has(a)) adj.set(a, new Set());
      adj.get(a)!.add(b);
    };
    for (const link of data.links) {
      const s = resolveId(link.source);
      const t = resolveId(link.target);
      connect(s, t);
      connect(t, s);
      bump(s);
      bump(t);
    }
    return { adjacency: adj, degree: deg };
  }, [data.links]);

  // Circle diameter in world units — smaller than the old spheres.
  const sizeFor = React.useCallback(
    (id: string) => Math.min(9, 4.5 + Math.sqrt(degree.get(id) ?? 0) * 1.6),
    [degree]
  );

  // Fill the container, tracking resizes. The CSS2D label layer is sized to match.
  React.useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(320, Math.floor(entry.contentRect.width));
      const height = Math.max(320, Math.floor(entry.contentRect.height));
      setDimensions({ width, height });
      cssRenderer?.setSize(width, height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [cssRenderer]);

  // A flat circle + crisp DOM label per node. Registered so hover can dim the rest.
  const nodeThreeObject = React.useCallback(
    (node: GraphNode) => {
      const id = String(node.id);
      const d = sizeFor(id);
      const group = new THREE.Group();

      const material = new THREE.SpriteMaterial({
        map: circleTexture ?? undefined,
        color: node.collectionColor,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(d, d, 1);
      group.add(sprite);

      const el = document.createElement('div');
      el.textContent = node.title;
      el.style.cssText = [
        'font: 600 10px/1 Inter, system-ui, sans-serif',
        'letter-spacing: -0.01em',
        `color: ${LABEL_INK}`,
        'white-space: nowrap',
        'pointer-events: none',
        'transform: translateY(-3px)',
        'text-shadow: 0 1px 3px rgba(245,246,250,0.9), 0 0 2px rgba(245,246,250,0.9)',
        'opacity: 0', // hidden until its node (or a neighbour) is hovered
        'transition: opacity 0.15s ease',
      ].join(';');
      const label = new CSS2DObject(el);
      label.position.set(0, d / 2 + 1.5, 0);
      group.add(label);

      objects.current.set(id, { material, label: el });
      return group;
    },
    [sizeFor, circleTexture]
  );

  const focusId = hoverId ?? selectedId;

  // Dim everything outside the focused node's neighbourhood.
  React.useEffect(() => {
    const neighbors = focusId ? adjacency.get(focusId) : null;
    objects.current.forEach((obj, id) => {
      const inFocusSet = focusId != null && (id === focusId || (neighbors?.has(id) ?? false));
      const dimmed = focusId != null && !inFocusSet;
      obj.material.opacity = dimmed ? DIM : 1;
      // Labels show only for the focused node and its direct connections.
      obj.label.style.opacity = inFocusSet ? '1' : '0';
      obj.label.style.color = id === focusId ? LABEL_INK_FOCUS : LABEL_INK;
    });
  }, [focusId, adjacency]);

  // Frame the whole graph once the layout settles. A very soft, far fog adds
  // just a touch of depth without washing the nodes out.
  const handleEngineStop = React.useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const scene = graph.scene();
    if (!scene.fog) scene.fog = new THREE.Fog(BACKGROUND, 600, 1800);
    graph.zoomToFit(700, 90);
  }, []);

  const focusNode = React.useCallback((node: GraphNode) => {
    setSelectedId(String(node.id));
    const graph = graphRef.current;
    if (!graph || node.x == null || node.y == null || node.z == null) return;
    const distance = Math.hypot(node.x, node.y, node.z) || 1;
    const ratio = 1 + FLY_DISTANCE / distance;
    graph.cameraPosition(
      { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio },
      { x: node.x, y: node.y, z: node.z },
      900
    );
  }, []);

  const focusById = React.useCallback(
    (id: string) => {
      // The engine mutates x/y/z onto these same node objects in place.
      const node = graphData.nodes.find((n) => String(n.id) === id) as GraphNode | undefined;
      if (node) focusNode(node);
    },
    [graphData, focusNode]
  );

  function zoomBy(factor: number) {
    const graph = graphRef.current;
    if (!graph) return;
    const { position } = graph.camera();
    graph.cameraPosition(
      { x: position.x * factor, y: position.y * factor, z: position.z * factor },
      undefined,
      250
    );
  }

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = data.nodes.find((node) => node.title.toLowerCase().includes(q));
    if (hit) focusById(hit.id);
  }

  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null;

  const selectedRelations = React.useMemo(() => {
    if (!selectedId) return [] as Array<{ label: string; items: KnowledgeGraphNode[] }>;
    const groups = new Map<string, KnowledgeGraphNode[]>();
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
      if (!seen.has(node.collectionName)) seen.set(node.collectionName, node.collectionColor);
    }
    return [...seen.entries()].map(([name, color]) => ({ name, color }));
  }, [data.nodes]);

  const linkTouchesFocus = React.useCallback(
    (link: GraphLink) =>
      focusId != null && (resolveId(link.source) === focusId || resolveId(link.target) === focusId),
    [focusId]
  );

  const panel = 'rounded-[12px] border-thin bg-surface/85 shadow-card backdrop-blur-md';

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-canvas">
      <ForceGraph3D
        ref={graphRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor={BACKGROUND}
        showNavInfo={false}
        extraRenderers={cssRenderer ? [cssRenderer] : []}
        nodeThreeObject={nodeThreeObject}
        nodeLabel={() => ''}
        linkColor={(link) => (focusId != null && !linkTouchesFocus(link) ? '#dcdee6' : LINK_BASE)}
        linkWidth={(link) => (focusId != null && linkTouchesFocus(link) ? 1.6 : 0.9)}
        linkOpacity={0.8}
        linkDirectionalParticles={(link) => (focusId != null && linkTouchesFocus(link) ? 2 : 0)}
        linkDirectionalParticleWidth={1.6}
        linkDirectionalParticleColor={(link) => RELATION_COLORS[link.relationType]}
        controlType="orbit"
        cooldownTicks={120}
        onEngineStop={handleEngineStop}
        onNodeHover={(node) => setHoverId(node ? String(node.id) : null)}
        onNodeClick={(node) => focusNode(node as GraphNode)}
        onBackgroundClick={() => setSelectedId(null)}
      />

      {/* Top-left: title + search */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
        <div className={`pointer-events-auto px-3.5 py-2 ${panel}`}>
          <h1 className="font-display text-[15px] font-bold leading-none tracking-[-0.02em] text-ink">
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

      {/* Bottom-left: legend + camera controls */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-2">
        {legend.length > 0 && (
          <div className={`px-3 py-2.5 ${panel}`}>
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

        <div className={`flex items-center gap-1 self-start p-1 ${panel}`}>
          <ControlButton label="Zoom in" onClick={() => zoomBy(0.8)}>
            <Plus className="h-4 w-4" />
          </ControlButton>
          <ControlButton label="Zoom out" onClick={() => zoomBy(1.25)}>
            <Minus className="h-4 w-4" />
          </ControlButton>
          <ControlButton label="Fit to view" onClick={() => graphRef.current?.zoomToFit(600, 60)}>
            <Maximize2 className="h-4 w-4" />
          </ControlButton>
        </div>
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
              style={{ backgroundColor: selectedNode.collectionColor }}
            />
            <span className="truncate font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
              {selectedNode.collectionName}
            </span>
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
                  <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => focusById(item.id)}
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

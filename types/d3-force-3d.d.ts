// Minimal surface of the force module bundled with react-force-graph's engine —
// typed here because d3-force-3d ships no declarations.
declare module 'd3-force-3d' {
  export interface CollideForce {
    (alpha: number): void;
    initialize?: (nodes: unknown[], ...args: unknown[]) => void;
  }
  export function forceCollide(
    radius?: number | ((node: { id?: string | number }) => number),
  ): CollideForce;

  interface SimulationNode {
    id?: string | number;
    x?: number;
    y?: number;
  }
  interface Simulation<T> {
    force(name: string, force: unknown): Simulation<T>;
    stop(): Simulation<T>;
    tick(iterations?: number): Simulation<T>;
  }
  export function forceSimulation<T extends SimulationNode>(
    nodes: T[],
    dimensions?: number,
  ): Simulation<T>;
  export function forceManyBody(): { strength(value: number): unknown };
  export function forceCenter(x?: number, y?: number): unknown;
  interface LinkForce {
    id(accessor: (node: SimulationNode) => string): LinkForce;
    distance(value: number): LinkForce;
    strength(value: number): LinkForce;
  }
  export function forceLink(links: unknown[]): LinkForce;
}

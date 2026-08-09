// Minimal surface of the force module bundled with react-force-graph's engine —
// typed here because d3-force-3d ships no declarations.
declare module 'd3-force-3d' {
  export interface CollideForce {
    (alpha: number): void;
    initialize?: (nodes: unknown[], ...args: unknown[]) => void;
  }
  export function forceCollide(
    radius?: number | ((node: { id?: string | number }) => number)
  ): CollideForce;
}

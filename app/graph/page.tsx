import { Network } from 'lucide-react';

export default function GraphPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-lg border-thin border-zinc-200/80 bg-white p-8">
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md border-thin border-zinc-200/80 text-zinc-400">
          <Network className="h-4 w-4" />
        </div>
        <h1 className="text-lg font-medium text-zinc-900">Graph</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          The graph view is reserved for the react-force-graph-2d implementation.
        </p>
      </div>
    </div>
  );
}

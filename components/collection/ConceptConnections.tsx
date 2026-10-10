'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { removeConceptConnection } from '@/app/collections/actions';

export interface ConceptNeighbourhood {
  connections: {
    slug: string;
    name: string;
    connection_id: string;
    kind: 'requires' | 'related_to';
    direction: 'incoming' | 'outgoing';
    note: string;
  }[];
  has_more_connections: boolean;
}

export function ConceptConnections({ slug, graph }: { slug: string; graph: ConceptNeighbourhood }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!graph.connections.length) return null;

  return (
    <section aria-label="Connected ideas" className="my-5 rounded-card border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">Connected ideas</h2>
      <ul className="space-y-3">
        {graph.connections.map((edge) => (
          <li key={edge.connection_id} className="flex items-start justify-between gap-4 text-sm">
            <div>
              <span className="text-muted">
                {edge.kind === 'related_to' ? 'Related to' : edge.direction === 'outgoing' ? 'Builds on' : 'Used by'}{' '}
              </span>
              <Link href={`/collections/${edge.slug}`} className="text-accent underline underline-offset-2">{edge.name}</Link>
              <p className="mt-1 text-muted">{edge.note}</p>
            </div>
            <button type="button" disabled={pending} className="focus-ring text-xs text-muted hover:text-ink disabled:opacity-50"
              aria-label={`Remove connection to ${edge.name}`}
              onClick={() => startTransition(async () => {
                setError(undefined);
                const result = await removeConceptConnection(slug, edge.connection_id);
                if (result.error) setError(result.error);
                else router.refresh();
              })}>Remove</button>
          </li>
        ))}
      </ul>
      {graph.has_more_connections && <p className="mt-3 text-xs text-muted">Showing the first 20 connections.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}

'use client';

import { useState } from 'react';
import { removeAutomaticLinks } from '@/app/graph/actions';
import { Button } from '@/components/ui/Button';

interface AutomaticLinkControlProps {
  count: number;
}

/** Removing connections is destructive and irreversible, so it asks once before firing. */
export function AutomaticLinkControl({ count }: AutomaticLinkControlProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (removed !== null) {
    return (
      <p className="text-[13px] text-muted">
        Removed {removed} automatic connection{removed === 1 ? '' : 's'}.
      </p>
    );
  }

  if (count === 0) {
    return <p className="text-[13px] text-faint">No automatic connections.</p>;
  }

  const remove = async () => {
    setBusy(true);
    setError(null);
    const result = await removeAutomaticLinks();
    setBusy(false);
    if (result.error !== undefined) {
      setError(result.error);
      setConfirming(false);
      return;
    }
    setRemoved(result.value);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-muted">
        {count} of these {count === 1 ? 'was' : 'were'} proposed automatically.
      </span>
      {confirming ? (
        <>
          <span className="rounded-full border border-warning-line bg-warning-soft px-2.5 py-1 text-[12.5px] font-medium text-warning">
            Remove all {count}?
          </span>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => void remove()}>
            {busy ? 'Removing…' : 'Yes, remove'}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
          Remove automatic connections
        </Button>
      )}
      {error && (
        <span role="alert" className="text-[13px] text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  commitPreview,
  discardPreview,
  loadPreview,
  proposeLinks,
} from '@/app/chat/actions';
import type { ReceiptData } from '@/components/chat/CurationReceipt';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { ImportSummary, PreviewDetail } from '@/lib/api-types';
import { cn } from '@/lib/utils';

const KILOBYTE = 1024;

function size(bytes: number): string {
  return bytes < KILOBYTE ? `${bytes} B` : `${(bytes / KILOBYTE).toFixed(1)} kB`;
}

interface Outcome {
  id: string;
  ok: boolean;
  error?: string;
  summary?: ImportSummary;
  conceptName?: string;
  conceptSlug?: string;
}

function isCommitted(
  outcome: Outcome
): outcome is Outcome & { summary: ImportSummary; conceptName: string; conceptSlug: string } {
  return outcome.summary !== undefined;
}

export interface CurationReviewModalProps {
  open: boolean;
  /** Every preview surfaced by the current agent turn that hasn't been resolved yet. */
  previewIds: string[];
  onClose: () => void;
  /** Fires once, after Done — one aggregate note for the agent plus a receipt for the UI. */
  onDone: (note: string, receipt: ReceiptData, resolvedIds: string[]) => void;
}

/**
 * All pending source previews reviewed together. Selecting artifacts across five sources used
 * to mean five separate "keep" clicks, each firing its own chat turn — this collects them into
 * one review pass with a single Done, so multi-select doesn't look like a one-shot action.
 */
export function CurationReviewModal({ open, previewIds, onClose, onDone }: CurationReviewModalProps) {
  const [previews, setPreviews] = useState<Map<string, PreviewDetail>>(new Map());
  const [selections, setSelections] = useState<Map<string, Set<string>>>(new Map());
  const [loadErrors, setLoadErrors] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [doneError, setDoneError] = useState<string | null>(null);

  useEffect(() => {
    const missing = previewIds.filter((id) => !previews.has(id) && !loadErrors.has(id));
    missing.forEach((id) => {
      void loadPreview(id).then((result) => {
        if (result.error !== undefined) {
          setLoadErrors((seen) => new Map(seen).set(id, result.error));
          return;
        }
        setPreviews((seen) => new Map(seen).set(id, result.value));
        setSelections((seen) =>
          new Map(seen).set(id, new Set(result.value.artifacts.map((artifact) => artifact.sourceKey)))
        );
      });
    });
  }, [previewIds, previews, loadErrors]);

  const loading = previewIds.some((id) => !previews.has(id) && !loadErrors.has(id));

  const toggleArtifact = (previewId: string, key: string) =>
    setSelections((seen) => {
      const next = new Map(seen);
      const set = new Set(next.get(previewId) ?? []);
      if (!set.delete(key)) set.add(key);
      next.set(previewId, set);
      return next;
    });

  const toggleAll = (previewId: string, keys: string[]) =>
    setSelections((seen) => {
      const next = new Map(seen);
      const current = next.get(previewId) ?? new Set<string>();
      next.set(previewId, current.size === keys.length ? new Set() : new Set(keys));
      return next;
    });

  const totalSelected = [...selections.values()].reduce((sum, set) => sum + set.size, 0);

  const handleDone = async () => {
    setBusy(true);
    setDoneError(null);

    const outcomes = await Promise.all(
      previewIds.map(async (id): Promise<Outcome> => {
        if (loadErrors.has(id)) return { id, ok: true };
        const preview = previews.get(id);
        if (!preview) return { id, ok: true };

        const chosen = [...(selections.get(id) ?? [])];
        if (chosen.length === 0) {
          const result = await discardPreview(id);
          const ok = result.error === undefined || result.error.includes('not found');
          return { id, ok, error: ok ? undefined : result.error };
        }

        const result = await commitPreview(id, chosen);
        if (result.error !== undefined) {
          const goneAlready = result.error.includes('not found');
          return { id, ok: goneAlready, error: goneAlready ? undefined : result.error };
        }
        return {
          id,
          ok: true,
          summary: result.value,
          conceptName: preview.conceptName,
          conceptSlug: result.value.conceptSlug,
        };
      })
    );

    const resolvedIds = outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.id);
    const failedCount = outcomes.length - resolvedIds.length;
    const committed = outcomes.filter(isCommitted);

    setBusy(false);
    if (failedCount > 0) {
      setDoneError(
        `Couldn't save ${failedCount} of ${previewIds.length} source${previewIds.length === 1 ? '' : 's'} — try again.`
      );
    }

    if (committed.length === 0) {
      if (resolvedIds.length > 0) {
        onDone(
          resolvedIds.length === 1
            ? 'I discarded that preview — nothing was saved.'
            : `I discarded ${resolvedIds.length} proposed sources — nothing was saved.`,
          { concepts: [], sourcesReviewed: resolvedIds.length, sourcesDiscarded: resolvedIds.length, links: 0 },
          resolvedIds
        );
      }
      return;
    }

    const byConcept = new Map(committed.map((c) => [c.conceptSlug, c.conceptName]));
    const linkCounts = await Promise.all(
      [...byConcept.keys()].map(async (slug) => {
        const result = await proposeLinks(slug);
        return result.error === undefined ? result.value.edges.length : 0;
      })
    );
    const totalLinks = linkCounts.reduce((sum, n) => sum + n, 0);
    const totalArtifacts = committed.reduce((sum, c) => sum + c.summary.artifacts, 0);
    const conceptNames = [...new Set(committed.map((c) => c.conceptName))];
    const concepts = [...byConcept.entries()].map(([slug, name]) => ({
      slug,
      name,
      artifacts: committed
        .filter((c) => c.conceptSlug === slug)
        .reduce((sum, c) => sum + c.summary.artifacts, 0),
    }));

    onDone(
      `I kept ${totalArtifacts} artifact${totalArtifacts === 1 ? '' : 's'} across ${committed.length} source${committed.length === 1 ? '' : 's'} into ${conceptNames.join(', ')}.${totalLinks > 0 ? ` Found ${totalLinks} new connection${totalLinks === 1 ? '' : 's'} in the graph.` : ''}`,
      {
        concepts,
        sourcesReviewed: resolvedIds.length,
        sourcesDiscarded: resolvedIds.length - committed.length,
        links: totalLinks,
      },
      resolvedIds
    );
  };

  return (
    <Modal open={open} onClose={onClose} labelledBy="curation-review-title">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 id="curation-review-title" className="text-[15px] font-semibold text-ink">
            Review what to keep
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {previewIds.length} source{previewIds.length === 1 ? '' : 's'} found — choose what earns a
            place.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="focus-ring shrink-0 rounded-[6px] p-1 text-faint transition-colors hover:bg-surface-soft hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="scroll-region min-h-0 flex-1 divide-y">
        {previewIds.map((id) => {
          if (loadErrors.has(id)) {
            return (
              <p key={id} role="alert" className="px-5 py-4 text-[13px] text-danger">
                {loadErrors.get(id)}
              </p>
            );
          }
          const preview = previews.get(id);
          if (!preview) {
            return (
              <div key={id} className="px-5 py-4">
                <div className="h-4 w-40 animate-pulse rounded-[4px] bg-surface-soft" />
              </div>
            );
          }
          return (
            <PreviewSection
              key={id}
              preview={preview}
              chosen={selections.get(id) ?? new Set()}
              onToggle={(key) => toggleArtifact(id, key)}
              onToggleAll={() => toggleAll(id, preview.artifacts.map((a) => a.sourceKey))}
            />
          );
        })}
      </div>

      {doneError && (
        <p role="alert" className="border-t px-5 py-2.5 text-[13px] text-danger">
          {doneError}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-t px-5 py-3.5">
        <span className="text-[12px] text-faint">
          {loading ? 'Loading…' : `${totalSelected} artifact${totalSelected === 1 ? '' : 's'} selected`}
        </span>
        <span className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Not now
          </Button>
          <Button variant="primary" size="sm" onClick={() => void handleDone()} disabled={busy || loading}>
            {busy ? 'Saving…' : 'Done'}
          </Button>
        </span>
      </div>
    </Modal>
  );
}

interface PreviewSectionProps {
  preview: PreviewDetail;
  chosen: Set<string>;
  onToggle: (key: string) => void;
  onToggleAll: () => void;
}

function PreviewSection({ preview, chosen, onToggle, onToggleAll }: PreviewSectionProps) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{preview.conceptName}</p>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary">{preview.artifacts.length} proposed</Badge>
            <span className="text-[12px] text-faint">{size(preview.totalBytes)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleAll}
          className="focus-ring shrink-0 rounded-[6px] px-1.5 py-1 text-[12px] text-muted transition-colors hover:bg-surface-soft hover:text-ink"
        >
          {chosen.size === preview.artifacts.length ? 'Select none' : 'Select all'}
        </button>
      </div>

      {preview.alreadyKnown.length > 0 && (
        <p className="bg-surface-soft px-5 py-2 text-[12.5px] text-muted">
          Already have {preview.alreadyKnown.length} artifact{preview.alreadyKnown.length === 1 ? '' : 's'}{' '}
          on this — including <span className="text-ink">{preview.alreadyKnown[0].title}</span>.
        </p>
      )}

      <ul className="pb-1.5">
        {preview.artifacts.map((artifact) => {
          const picked = chosen.has(artifact.sourceKey);
          return (
            <li key={artifact.sourceKey}>
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 px-5 py-2 transition-colors hover:bg-surface-soft',
                  !picked && 'opacity-55'
                )}
              >
                <input
                  type="checkbox"
                  checked={picked}
                  onChange={() => onToggle(artifact.sourceKey)}
                  className="focus-ring mt-1 h-3.5 w-3.5 rounded-sm accent-[var(--action)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-ink">{artifact.title}</span>
                  {artifact.breadcrumb && (
                    <span className="block truncate font-mono text-[11px] text-faint">
                      {artifact.breadcrumb}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[12px] text-faint">{size(artifact.bytes)}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

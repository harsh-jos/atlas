"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  commitPreview,
  discardPreview,
  loadPreview,
  proposeLinks,
} from "@/app/chat/actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { ImportSummary, LinkReport, PreviewDetail } from "@/lib/api-types";
import { cn } from "@/lib/utils";

const KILOBYTE = 1024;

function size(bytes: number): string {
  return bytes < KILOBYTE
    ? `${bytes} B`
    : `${(bytes / KILOBYTE).toFixed(1)} kB`;
}

interface CurationCardProps {
  previewId: string;
  onResolved: (note: string) => void;
}

/** The curation moment: choose artifacts, not a URL. Nothing is written until Keep is pressed. */
export function CurationCard({ previewId, onResolved }: CurationCardProps) {
  const [preview, setPreview] = useState<PreviewDetail | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ImportSummary | null>(null);
  const [discarded, setDiscarded] = useState(false);
  const [links, setLinks] = useState<LinkReport | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    void loadPreview(previewId).then((result) => {
      if (result.error !== undefined) {
        setError(result.error);
        return;
      }
      setPreview(result.value);
      setChosen(
        new Set(result.value.artifacts.map((artifact) => artifact.sourceKey)),
      );
    });
  }, [previewId]);

  if (discarded || (!preview && !error)) {
    return null;
  }

  if (saved && preview) {
    return (
      <div className="animate-rise overflow-hidden rounded-card border-thin bg-surface text-[14px] shadow-card">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <Badge variant="success">Kept</Badge>
          <p className="text-ink">
            {saved.artifacts} {saved.artifacts === 1 ? "artifact" : "artifacts"} in{" "}
            <Link
              href={`/collections/${saved.conceptSlug}`}
              className="focus-ring rounded-[4px] text-accent hover:underline"
            >
              {preview.conceptName}
            </Link>
          </p>
        </div>

        {linking && (
          <p className="flex items-center gap-2 border-t-thin px-4 py-2.5 font-mono text-[12px] text-faint">
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent/70"
              style={{ animationDuration: "1.4s" }}
            />
            Looking for connections…
          </p>
        )}

        {links && links.edges.length > 0 && (
          <div className="border-t-thin">
            <p className="px-4 pt-3 text-[12px] text-faint">
              {links.edges.length} connection
              {links.edges.length === 1 ? "" : "s"} found
            </p>
            <ul className="space-y-1.5 px-4 pb-3 pt-2">
              {links.edges.map((edge, index) => (
                <li key={index} className="text-[13px] leading-snug">
                  <span className="text-ink">{edge.fromTitle}</span>
                  <span className="mx-1.5 font-mono text-[11px] text-accent">
                    {edge.relationType.toLowerCase().replace("_", " ")}
                  </span>
                  <span className="text-ink">{edge.toTitle}</span>
                  <span className="block text-[12px] text-faint">
                    {edge.note}
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t-thin px-4 py-2 text-[11px] text-faint">
              Proposed automatically — every one is labelled and removable from
              the{" "}
              <Link href="/graph" className="focus-ring rounded-[4px] text-muted hover:text-ink">
                graph
              </Link>
              .
            </p>
          </div>
        )}

        {links && links.edges.length === 0 && !linking && (
          <p className="border-t-thin px-4 py-2.5 text-[12px] text-faint">
            No new connections worth proposing.
          </p>
        )}
      </div>
    );
  }

  const toggle = (key: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const selectedBytes =
    preview?.artifacts
      .filter((artifact) => chosen.has(artifact.sourceKey))
      .reduce((total, artifact) => total + artifact.bytes, 0) ?? 0;

  const resolve = async (action: "keep" | "discard") => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const result =
      action === "keep"
        ? await commitPreview(preview.id, [...chosen])
        : await discardPreview(preview.id);
    setBusy(false);

    if (result.error !== undefined) {
      // The agent may have committed it verbally first; that is resolved, not broken.
      if (result.error.includes("not found")) {
        setDiscarded(true);
        return;
      }
      setError(result.error);
      return;
    }
    if (action === "discard") {
      setDiscarded(true);
      onResolved("I discarded that preview — nothing was saved.");
      return;
    }
    const summary = result.value as ImportSummary;
    setSaved(summary);
    onResolved(
      `I kept ${summary.artifacts} of ${preview.artifacts.length} artifacts from that source.`,
    );

    // Linking calls a model per batch, so it runs after the keep rather than blocking it.
    setLinking(true);
    const linked = await proposeLinks(summary.conceptSlug);
    setLinking(false);
    if (linked.error === undefined) {
      setLinks(linked.value);
    }
  };

  if (!preview) {
    return (
      <p role="alert" className="text-[13px] text-red-600">
        {error}
      </p>
    );
  }

  return (
    <div className="animate-rise overflow-hidden rounded-card border-thin bg-surface shadow-card">
      <div className="flex items-start justify-between gap-3 border-b-thin px-4 py-3">
        <div className="min-w-0">
          <p className="font-display text-[14px] font-[650] text-ink">
            {preview.conceptName}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <Badge variant="secondary">
              {preview.artifacts.length} proposed
            </Badge>
            <span className="text-[12px] text-faint">
              {size(preview.totalBytes)}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            setChosen((current) =>
              current.size === preview.artifacts.length
                ? new Set()
                : new Set(
                    preview.artifacts.map((artifact) => artifact.sourceKey),
                  ),
            )
          }
          className="focus-ring shrink-0 rounded-[6px] px-1.5 py-1 text-[12px] text-muted transition-colors hover:bg-surface-soft hover:text-ink"
        >
          {chosen.size === preview.artifacts.length
            ? "Select none"
            : "Select all"}
        </button>
      </div>

      {preview.alreadyKnown.length > 0 && (
        <p className="border-b-thin bg-surface-soft px-4 py-2.5 text-[13px] text-muted">
          You already have {preview.alreadyKnown.length} artifact
          {preview.alreadyKnown.length === 1 ? "" : "s"} on this — including{" "}
          <span className="text-ink">{preview.alreadyKnown[0].title}</span>.
        </p>
      )}

      <ul className="max-h-[22rem] divide-y divide-[var(--hairline)] overflow-y-auto">
        {preview.artifacts.map((artifact) => {
          const picked = chosen.has(artifact.sourceKey);
          return (
            <li key={artifact.sourceKey}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-soft",
                  !picked && "opacity-55",
                )}
              >
                <input
                  type="checkbox"
                  checked={picked}
                  onChange={() => toggle(artifact.sourceKey)}
                  className="focus-ring mt-1 h-3.5 w-3.5 rounded-sm accent-[var(--action)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-ink">
                    {artifact.title}
                  </span>
                  {artifact.breadcrumb && (
                    <span className="block truncate font-mono text-[11px] text-faint">
                      {artifact.breadcrumb}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[12px] text-faint">
                  {size(artifact.bytes)}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="px-4 pt-3 text-[13px] text-red-600">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-t-thin px-4 py-3">
        <span className="text-[12px] text-faint">
          {chosen.size} selected · {size(selectedBytes)}
        </span>
        <span className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void resolve("discard")}
          >
            Discard
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || chosen.size === 0}
            onClick={() => void resolve("keep")}
          >
            {busy ? "Keeping…" : `Keep ${chosen.size}`}
          </Button>
        </span>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CircleAlert, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { buildStatus, startBuild } from '@/app/build/actions';
import type { KbBuildStatus, LlmProvider } from '@/lib/api-types';

const POLL_MS = 2500;

/** URL + goal + which model does the reading; then a live log of the build. */
export function BuildForm({ providers }: { providers: LlmProvider[] }) {
  const configured = useMemo(() => providers.filter((p) => p.configured), [providers]);
  const initial = configured.find((p) => p.isDefault) ?? configured[0];

  const [url, setUrl] = useState('');
  const [goal, setGoal] = useState('');
  const [providerId, setProviderId] = useState(initial?.id ?? '');
  const [model, setModel] = useState(initial?.defaultModel ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<KbBuildStatus | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  const selectProvider = (id: string) => {
    setProviderId(id);
    const provider = providers.find((p) => p.id === id);
    if (provider) setModel(provider.defaultModel);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const started = await startBuild({
      url: url.trim(),
      goal: goal.trim() || undefined,
      provider: providerId || undefined,
      model: model.trim() || undefined,
    });
    if (started.error !== undefined) {
      setError(started.error);
      setSubmitting(false);
      return;
    }
    const id = started.value;
    timer.current = setInterval(async () => {
      const polled = await buildStatus(id);
      if (polled.error !== undefined) return; // transient; keep polling
      setJob(polled.value);
      if (polled.value.status !== 'running') {
        stopPolling();
        setSubmitting(false);
      }
    }, POLL_MS);
  };

  const running = submitting || job?.status === 'running';

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="rounded-card border bg-surface p-5 shadow-card space-y-4">
        <Field label="Documentation URL" hint="The docs you want to learn from.">
          <Input
            required
            type="url"
            placeholder="https://docs.pytorch.org/tutorials/"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={running}
          />
        </Field>

        <Field
          label="Learning goal"
          hint="What should the articles aim at? Optional, but a specific goal makes a sharper knowledge base."
        >
          <Input
            placeholder="Understand tensors, autograd and training loops well enough to write my own"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            disabled={running}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Model provider">
            <select
              value={providerId}
              onChange={(e) => selectProvider(e.target.value)}
              disabled={running}
              className="focus-ring h-10 w-full rounded-field border border-hairline-strong bg-surface px-3 text-sm text-ink disabled:opacity-50"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.configured}>
                  {p.label}
                  {p.configured ? '' : ' — not configured'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Model" hint="Prefilled with the provider's default.">
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={running}
            />
          </Field>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-[13.5px] text-danger">
            <CircleAlert className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={running || configured.length === 0}>
            {running ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" /> Building…
              </>
            ) : (
              'Build knowledge base'
            )}
          </Button>
        </div>
        {configured.length === 0 && (
          <p className="text-[13px] text-muted">
            No LLM provider is configured. Set credentials for Gemini, DeepSeek, Meta, or run
            Ollama locally, then restart the backend.
          </p>
        )}
      </form>

      {job && <BuildLog job={job} />}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="block text-[12.5px] text-faint">{hint}</span>}
    </label>
  );
}

/** The build narrates itself; this panel is that narration, verbatim. */
function BuildLog({ job }: { job: KbBuildStatus }) {
  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [job.log.length]);

  return (
    <div className="overflow-hidden rounded-card border bg-surface shadow-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-[13px] font-medium text-ink">
          {job.status === 'running' && 'Building…'}
          {job.status === 'done' && 'Knowledge base ready'}
          {job.status === 'error' && 'Build failed'}
        </span>
        {job.status === 'done' && job.conceptSlug && (
          <Link
            href={`/collections/${job.conceptSlug}`}
            className="focus-ring inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
          >
            Open it <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div ref={scroller} className="max-h-72 overflow-y-auto px-4 py-3">
        <ol className="space-y-1 font-mono text-[12px] leading-relaxed text-muted">
          {job.log.map((line, i) => (
            <li key={i} className="whitespace-pre-wrap">
              {line}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

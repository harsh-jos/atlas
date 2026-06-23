'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Globe,
  Loader2,
  Newspaper,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/lib/utils';
import type { ImportJobStatus } from '@/lib/import-service';

type Kind = 'url' | 'article' | 'markdown' | 'file';

const KINDS = [
  { value: 'url', label: 'Docs site', icon: Globe, hint: 'A whole documentation site — tries llms-full.txt, then the sitemap.' },
  { value: 'article', label: 'Article', icon: Newspaper, hint: 'A single web page or blog post.' },
  { value: 'markdown', label: 'Markdown', icon: FileText, hint: 'Paste markdown text directly.' },
  { value: 'file', label: 'File', icon: Upload, hint: 'Upload a PDF (book or paper) or a .md file.' },
] as const;

const TERMINAL = new Set<ImportJobStatus['status']>(['done', 'failed']);
const POLL_MS = 1500;
const STAGE_LABEL: Record<string, string> = {
  queued: 'Queued…',
  running: 'Starting…',
  loading: 'Fetching & parsing the source…',
  segmenting: 'Splitting into entries…',
  writing: 'Writing to your library…',
  done: 'Done',
};

export function ImportPanel() {
  const router = useRouter();
  const [kind, setKind] = React.useState<Kind>('url');
  const [url, setUrl] = React.useState('');
  const [text, setText] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [collectionName, setCollectionName] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<ImportJobStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const inFlight = submitting || (status !== null && !TERMINAL.has(status.status));

  // Poll the job until it reaches a terminal state. Depends only on jobId.
  React.useEffect(() => {
    if (!jobId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const response = await fetch(`/api/imports/${jobId}`);
        const data = (await response.json()) as ImportJobStatus;
        if (!active) return;
        setStatus(data);
        if (TERMINAL.has(data.status)) {
          if (data.status === 'done') router.refresh();
          return;
        }
      } catch {
        // transient — keep polling
      }
      if (active) timer = setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [jobId, router]);

  function validate(): string | null {
    if ((kind === 'url' || kind === 'article') && !url.trim()) return 'Enter a URL.';
    if (kind === 'markdown' && !text.trim()) return 'Paste some markdown.';
    if (kind === 'file' && !file) return 'Choose a PDF or .md file.';
    return null;
  }

  async function submit() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    setError(null);
    setStatus(null);
    setJobId(null);

    try {
      let response: Response;
      if (kind === 'file') {
        const form = new FormData();
        form.append('file', file as File);
        if (collectionName.trim()) form.append('collectionName', collectionName.trim());
        response = await fetch('/api/imports', { method: 'POST', body: form });
      } else {
        const payload: Record<string, string> = { kind };
        if (kind === 'url' || kind === 'article') payload.url = url.trim();
        if (kind === 'markdown') {
          payload.text = text;
          if (title.trim()) payload.title = title.trim();
        }
        if (collectionName.trim()) payload.collectionName = collectionName.trim();
        response = await fetch('/api/imports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await response.json();
      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Import failed to start.');
        return;
      }
      setJobId(data.jobId as string);
    } catch {
      setError('Could not reach the app. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const active = KINDS.find((k) => k.value === kind);

  return (
    <div className="rounded-card border-thin bg-surface p-6 shadow-card">
      {/* Source kind */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {KINDS.map((option) => {
          const Icon = option.icon;
          const selected = option.value === kind;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setKind(option.value)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-[10px] border-thin px-3 py-3 text-[13px] font-medium transition-colors',
                selected
                  ? 'border-accent/40 bg-accent-soft/50 text-accent'
                  : 'bg-surface text-muted hover:bg-surface-soft hover:text-ink'
              )}
            >
              <Icon className="h-4 w-4" />
              {option.label}
            </button>
          );
        })}
      </div>
      {active && <p className="mt-2.5 text-[13px] text-faint">{active.hint}</p>}

      {/* Inputs */}
      <div className="mt-5 grid gap-3">
        {(kind === 'url' || kind === 'article') && (
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={kind === 'url' ? 'https://docs.example.com' : 'https://example.com/post'}
            inputMode="url"
          />
        )}

        {kind === 'markdown' && (
          <>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" />
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="# Paste markdown here"
              className="min-h-44 font-mono text-[13px] leading-6"
            />
          </>
        )}

        {kind === 'file' && (
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[var(--hairline)] bg-surface-soft/50 px-4 py-3 text-[13px] text-muted transition-colors hover:border-accent/40 hover:text-ink">
            <Upload className="h-4 w-4 shrink-0 text-faint" />
            <span className="truncate">{file ? file.name : 'Choose a PDF or .md file'}</span>
            <input
              type="file"
              accept=".pdf,.md,.markdown"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

        <Input
          value={collectionName}
          onChange={(e) => setCollectionName(e.target.value)}
          placeholder="Collection name (optional — inferred from the source if blank)"
        />
      </div>

      {error && (
        <p className="mt-4 flex items-center gap-1.5 text-[13px] text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <Button onClick={submit} disabled={inFlight} className="gap-1.5">
          {inFlight && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {inFlight ? 'Importing' : 'Import'}
        </Button>
      </div>

      {status && <StatusBlock status={status} />}
    </div>
  );
}

function StatusBlock({ status }: { status: ImportJobStatus }) {
  if (status.status === 'failed') {
    return (
      <div className="mt-5 flex items-start gap-2 rounded-lg border-thin border-red-200/70 bg-red-50/60 px-3.5 py-3 text-[13px] text-red-700">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Import failed</p>
          {status.error && <p className="mt-0.5 break-words text-red-600/90">{status.error}</p>}
        </div>
      </div>
    );
  }

  if (status.status === 'done' && status.result) {
    const { collectionSlug, entries, relations } = status.result;
    return (
      <div className="mt-5 flex items-start gap-2 rounded-lg border-thin border-green-200/70 bg-green-50/50 px-3.5 py-3 text-[13px] text-green-800">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
        <div>
          <p className="font-medium">
            Imported {entries} {entries === 1 ? 'entry' : 'entries'} and {relations}{' '}
            {relations === 1 ? 'relation' : 'relations'}.
          </p>
          <Link
            href={`/collections/${collectionSlug}`}
            className="mt-0.5 inline-block text-accent underline-offset-2 hover:underline"
          >
            Open the collection →
          </Link>
        </div>
      </div>
    );
  }

  const stage = status.progress?.stage ?? status.status;
  return (
    <div className="mt-5 flex items-center gap-2 rounded-lg border-thin bg-surface-soft/60 px-3.5 py-3 text-[13px] text-muted">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
      <span>{STAGE_LABEL[stage] ?? 'Working…'}</span>
    </div>
  );
}

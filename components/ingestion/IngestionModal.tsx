'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Loader2, FileText, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { SuggestedRelations } from '@/components/ingestion/SuggestedRelations';
import type { IngestionPreview, IngestionStage } from '@/lib/ingestion-types';
import { cn } from '@/lib/utils';

interface IngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ALLOWED_EXTENSIONS = '.pdf,.md,.html,.htm,.txt,.markdown';

export function IngestionModal({ isOpen, onClose }: IngestionModalProps) {
  const router = useRouter();

  const [stage, setStage] = React.useState<IngestionStage>('select');
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<IngestionPreview | null>(null);
  const [collections, setCollections] = React.useState<
    Array<{ id: string; name: string; color: string | null }>
  >([]);
  const [selectedCollectionId, setSelectedCollectionId] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const summaryRef = React.useRef<HTMLTextAreaElement>(null);

  // Reset state when modal closes
  const handleClose = React.useCallback(() => {
    setStage('select');
    setFile(null);
    setPreview(null);
    setError(null);
    setIsSaving(false);
    onClose();
  }, [onClose]);

  // Prevent scrolling background when modal is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Summary textarea auto-resize
  React.useEffect(() => {
    if (stage === 'preview' && summaryRef.current) {
      summaryRef.current.style.height = 'auto';
      summaryRef.current.style.height = summaryRef.current.scrollHeight + 'px';
    }
  }, [stage, preview?.summary]);

  const handleFileSelect = (selectedFile: File) => {
    const ext = '.' + selectedFile.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setError(`Unsupported file type. Allowed: PDF, Markdown, HTML, TXT`);
      setStage('error');
      return;
    }
    setFile(selectedFile);
    setError(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleProcess = async () => {
    if (!file) return;

    setStage('processing');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.error ?? `Server error (${res.status})`);
      }

      const data = await res.json();
      setPreview(data.preview);

      // Fetch collections for the dropdown
      const collectionsRes = await fetch('/api/collections');
      if (collectionsRes.ok) {
        const cols = await collectionsRes.json();
        setCollections(cols);
        if (cols.length > 0) {
          setSelectedCollectionId(cols[0].id);
        }
      }

      setStage('preview');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process file';
      setError(message);
      setStage('error');
    }
  };

  const handleSave = async () => {
    if (!preview) return;

    setIsSaving(true);
    setError(null);

    try {
      const approvedRelations = (preview.suggestedRelations ?? [])
        .filter((r) => r.approved)
        .map((r) => ({
          toId: r.candidateId,
          relationType: r.relationType,
          note: r.note || undefined,
        }));

      const sources = file
        ? [
            {
              sourceType: getDefaultSourceType(file.name),
              title: file.name,
              url: undefined,
              author: undefined,
              ref: undefined,
            },
          ]
        : [];

      const createPayload = {
        title: preview.title || 'Untitled',
        summary: preview.summary ?? '',
        body: preview.body ?? '',
        tags: preview.tags ?? [],
        status: 'DRAFT',
        collectionId: selectedCollectionId || undefined,
        metadata: preview.metadata ?? undefined,
        sources,
        relations: approvedRelations,
      };

      const createRes = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
      });

      if (!createRes.ok) {
        const errData = await createRes.json().catch(() => ({}));
        throw new Error(errData.error ?? 'Failed to save entry');
      }

      const savedEntry = await createRes.json();
      handleClose();
      router.push(`/entries/${savedEntry.slug}`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save entry';
      setError(message);
      setStage('preview'); // stay in preview on failure
      setIsSaving(false);
    }
  };

  const toggleRelation = (index: number) => {
    if (!preview) return;
    const updated = [...preview.suggestedRelations];
    updated[index] = { ...updated[index], approved: !updated[index].approved };
    setPreview({ ...preview, suggestedRelations: updated });
  };

  const removeRelation = (index: number) => {
    if (!preview) return;
    const updated = preview.suggestedRelations.filter((_, i) => i !== index);
    setPreview({ ...preview, suggestedRelations: updated });
  };

  const updateField = <K extends keyof IngestionPreview>(key: K, value: IngestionPreview[K]) => {
    if (!preview) return;
    setPreview({ ...preview, [key]: value });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-canvas/80 backdrop-blur-md"
        onClick={handleClose}
      />

      {/* Modal card */}
      <div className="relative z-10 w-full max-w-2xl mx-4 rounded-2xl bg-surface border-thin shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b-thin px-6 py-4">
          <h2 className="text-[17px] font-semibold text-ink">Import File</h2>
          <button
            onClick={handleClose}
            className="rounded-full p-1.5 text-faint hover:text-ink hover:bg-subtle transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 px-3 py-2.5 text-[13px] text-red-700 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
              <p>{error}</p>
            </div>
          )}

          {/* Stage: Select */}
          {stage === 'select' && (
            <div className="space-y-4">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 cursor-pointer transition-colors',
                  isDragging
                    ? 'border-accent bg-accent/5'
                    : 'border-thin bg-subtle/50 hover:bg-subtle',
                )}
              >
                {file ? (
                  <>
                    <FileText className="h-10 w-10 text-accent" />
                    <div className="text-center">
                      <p className="text-[14px] font-medium text-ink">{file.name}</p>
                      <p className="text-[12px] text-muted">{formatFileSize(file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        setError(null);
                      }}
                      className="text-[12px] text-muted hover:text-ink underline underline-offset-2"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-faint" />
                    <div className="text-center">
                      <p className="text-[14px] text-ink">
                        Drag a file here or click to browse
                      </p>
                      <p className="text-[12px] text-muted mt-0.5">
                        PDF, Markdown, HTML, or TXT
                      </p>
                    </div>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_EXTENSIONS}
                  className="hidden"
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    if (selected) handleFileSelect(selected);
                    // Reset so re-selecting the same file works
                    e.target.value = '';
                  }}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleProcess}
                  disabled={!file}
                  className="gap-2"
                >
                  Process
                </Button>
              </div>
            </div>
          )}

          {/* Stage: Processing */}
          {stage === 'processing' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <div className="text-center">
                <p className="text-[14px] font-medium text-ink">Processing file...</p>
                <p className="text-[13px] text-muted mt-1">
                  Extracting text and analyzing content with AI
                </p>
              </div>
            </div>
          )}

          {/* Stage: Preview */}
          {stage === 'preview' && preview && (
            <div className="space-y-5">
              {/* Editable fields */}
              <div className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-medium text-muted uppercase tracking-wider">Title</span>
                  <Input
                    value={preview.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    className="text-[15px] font-medium"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[12px] font-medium text-muted uppercase tracking-wider">Summary</span>
                  <Textarea
                    ref={summaryRef}
                    value={preview.summary}
                    onChange={(e) => updateField('summary', e.target.value)}
                    className="text-[13px] min-h-[60px]"
                    rows={3}
                  />
                </label>

                <div className="grid grid-cols-2 gap-4">
                  <label className="block space-y-1.5">
                    <span className="text-[12px] font-medium text-muted uppercase tracking-wider">Tags</span>
                    <Input
                      value={preview.tags.join(', ')}
                      onChange={(e) => updateField('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                      placeholder="e.g. deep-learning, transformers"
                      className="text-[13px]"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-[12px] font-medium text-muted uppercase tracking-wider">Collection</span>
                    <select
                      value={selectedCollectionId}
                      onChange={(e) => setSelectedCollectionId(e.target.value)}
                      className="w-full h-9 rounded-lg border-thin bg-white dark:bg-black px-3 text-[13px] text-ink focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/15"
                    >
                      {collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {/* Body preview */}
              <div>
                <h3 className="text-[12px] font-medium text-muted uppercase tracking-wider mb-2">
                  AI-Generated Content
                </h3>
                <div className="rounded-lg border-thin bg-subtle/50 p-4 max-h-64 overflow-y-auto">
                  <pre className="text-[13px] text-ink leading-relaxed whitespace-pre-wrap font-sans">
                    {preview.body}
                  </pre>
                </div>
              </div>

              {/* Suggested relations */}
              <div>
                <h3 className="text-[12px] font-medium text-muted uppercase tracking-wider mb-2">
                  Suggested Relations
                </h3>
                <SuggestedRelations
                  relations={preview.suggestedRelations}
                  onToggle={toggleRelation}
                  onRemove={removeRelation}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t-thin">
                <Button variant="ghost" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                  {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save Entry
                </Button>
              </div>
            </div>
          )}

          {/* Stage: Error */}
          {stage === 'error' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="rounded-full bg-red-100 dark:bg-red-950/30 p-3">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-[14px] font-medium text-ink">Processing failed</p>
                <p className="text-[13px] text-muted max-w-sm">{error}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setError(null);
                    setStage('select');
                  }}
                >
                  Try again
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDefaultSourceType(fileName: string): string {
  const ext = '.' + fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case '.pdf': return 'PAPER';
    case '.md':
    case '.markdown': return 'DOCS';
    case '.html':
    case '.htm': return 'WEBSITE';
    default: return 'DOCS';
  }
}

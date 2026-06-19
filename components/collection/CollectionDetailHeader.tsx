'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const SWATCHES = ['#0066cc', '#50e3c2', '#7928ca', '#16a34a', '#d97706', '#db2777', '#64748b'];

export interface CollectionDetailHeaderProps {
  slug: string;
  name: string;
  description: string | null;
  color: string | null;
  entryCount: number;
}

interface UpdatedCollection {
  slug: string;
}

export function CollectionDetailHeader({
  slug,
  name,
  description,
  color,
  entryCount,
}: CollectionDetailHeaderProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftName, setDraftName] = React.useState(name);
  const [draftDescription, setDraftDescription] = React.useState(description ?? '');
  const [draftColor, setDraftColor] = React.useState(color ?? SWATCHES[0]);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const accentColor = color || 'var(--faint)';

  function openEditor() {
    setDraftName(name);
    setDraftDescription(description ?? '');
    setDraftColor(color ?? SWATCHES[0]);
    setError(null);
    setIsEditing(true);
  }

  async function handleSave() {
    if (isSaving) return;
    if (!draftName.trim()) {
      setError('Enter a name.');
      return;
    }

    setIsSaving(true);
    setError(null);
    const response = await fetch(`/api/collections/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: draftName, description: draftDescription, color: draftColor }),
    });
    setIsSaving(false);

    if (!response.ok) {
      setError('Could not save changes.');
      return;
    }

    const updated = (await response.json()) as UpdatedCollection;
    setIsEditing(false);
    if (updated.slug !== slug) {
      router.replace(`/collections/${updated.slug}`);
    }
    router.refresh();
  }

  async function handleDelete() {
    if (isDeleting) return;
    if (!window.confirm(`Delete the “${name}” collection? This cannot be undone.`)) return;

    setIsDeleting(true);
    setError(null);
    const response = await fetch(`/api/collections/${slug}`, { method: 'DELETE' });

    if (!response.ok) {
      setIsDeleting(false);
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? 'Could not delete this collection.');
      return;
    }

    router.push('/');
    router.refresh();
  }

  if (isEditing) {
    return (
      <div className="mb-8 rounded-[12px] border-thin bg-surface p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-bold text-ink">Edit collection</h2>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="text-faint transition-colors hover:text-ink"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid max-w-md gap-2.5">
          <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Name" />
          <Input
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            placeholder="Description (optional)"
          />
          <div className="flex items-center gap-2 pt-0.5">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => setDraftColor(swatch)}
                aria-label={`Use ${swatch}`}
                className="h-4 w-4 rounded-full transition-transform hover:scale-110"
                style={{
                  backgroundColor: swatch,
                  outline: draftColor === swatch ? '2px solid rgba(0,0,0,0.25)' : 'none',
                  outlineOffset: '1.5px',
                }}
              />
            ))}
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </p>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div>
        <div className="mb-2 flex items-center gap-3">
          <span
            className="inline-block h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <h1 className="font-display text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-ink">
            {name}
          </h1>
        </div>
        {description && (
          <p className="ml-6 mb-2 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>
        )}
        <p className="ml-6 text-[13px] text-faint">
          {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={openEditor}>
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
          onClick={handleDelete}
          disabled={isDeleting || entryCount > 0}
          title={entryCount > 0 ? 'Move or delete its entries first' : 'Delete collection'}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {isDeleting ? 'Deleting' : 'Delete'}
        </Button>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}
    </div>
  );
}

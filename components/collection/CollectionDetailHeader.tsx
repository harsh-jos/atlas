'use client';

import * as React from 'react';
import { AlertCircle, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConceptForm } from '@/components/collection/ConceptForm';
import { deleteConcept, updateConcept, type ConceptDraft } from '@/app/collections/actions';

export interface CollectionDetailHeaderProps {
  slug: string;
  name: string;
  description: string | null;
  color: string | null;
  entryCount: number;
}

export function CollectionDetailHeader({
  slug,
  name,
  description,
  color,
  entryCount,
}: CollectionDetailHeaderProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function remove() {
    if (isDeleting) return;
    if (!window.confirm(`Delete the “${name}” collection? This cannot be undone.`)) return;

    setIsDeleting(true);
    setError(null);
    const result = await deleteConcept(slug);

    if (result?.error) {
      setIsDeleting(false);
      setError(result.error);
    }
  }

  if (isEditing) {
    return (
      <div className="mb-8 rounded-card border-thin bg-surface p-5 shadow-card">
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

        <div className="max-w-md">
          <ConceptForm
            initial={{ name, description, color }}
            submitLabel="Save"
            onSubmit={(draft: ConceptDraft) => updateConcept(slug, draft)}
            onClose={() => setIsEditing(false)}
          />
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
            style={{ backgroundColor: color || 'var(--faint)' }}
          />
          <h1 className="font-title text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-ink">
            {name}
          </h1>
        </div>
        {description && (
          <p className="ml-6 mb-2 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>
        )}
        <p className="ml-6 text-[13px] text-faint">
          {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
        </p>
        {error && (
          <p className="ml-6 mt-2 flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={() => setIsEditing(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
          onClick={remove}
          disabled={isDeleting || entryCount > 0}
          title={entryCount > 0 ? 'Move or delete its entries first' : 'Delete collection'}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {isDeleting ? 'Deleting' : 'Delete'}
        </Button>
      </div>
    </div>
  );
}

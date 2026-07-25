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
      <div className="animate-rise mb-8 rounded-card border-thin bg-surface p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-bold text-ink">Edit collection</h2>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="focus-ring rounded-md p-1 text-faint transition-colors duration-[var(--dur-fast)] hover:bg-surface-soft hover:text-ink"
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
    <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="mb-2.5 flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color || 'var(--faint)' }}
          />
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint">
            {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
          </p>
        </div>
        <h1 className="font-title text-[32px] font-extrabold leading-[1.1] tracking-[-0.035em] text-ink sm:text-[38px]">
          {name}
        </h1>
        {description && (
          <p className="mt-2.5 max-w-xl text-[15px] leading-6 text-muted">{description}</p>
        )}
        {error && (
          <p className="mt-2.5 flex items-center gap-1.5 text-[13px] text-red-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
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
    </header>
  );
}

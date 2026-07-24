'use client';

import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { ConceptDraft } from '@/app/collections/actions';
import type { ActionResult } from '@/lib/actions';

const SWATCHES = ['#0066cc', '#50e3c2', '#7928ca', '#16a34a', '#d97706', '#db2777', '#64748b'];

export interface ConceptFormProps {
  initial?: { name: string; description: string | null; color: string | null };
  submitLabel: string;
  onSubmit: (draft: ConceptDraft) => Promise<ActionResult<unknown>>;
  onClose: () => void;
}

/** The name/description/colour fields shared by creating and renaming a collection. */
export function ConceptForm({ initial, submitLabel, onSubmit, onClose }: ConceptFormProps) {
  const [name, setName] = React.useState(initial?.name ?? '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [color, setColor] = React.useState(initial?.color ?? SWATCHES[0]);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    if (isSaving) return;
    if (!name.trim()) {
      setError('Enter a name.');
      return;
    }

    setIsSaving(true);
    setError(null);
    const result = await onSubmit({ name, description, color });
    setIsSaving(false);

    if (result?.error) setError(result.error);
    else onClose();
  }

  return (
    <div className="grid gap-2.5">
      <Input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void submit();
          if (event.key === 'Escape') onClose();
        }}
        placeholder="Name"
      />
      <Input
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Description (optional)"
      />

      <div className="flex items-center gap-2 pt-0.5">
        {SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => setColor(swatch)}
            aria-label={`Use ${swatch}`}
            className="h-4 w-4 rounded-full transition-transform hover:scale-110"
            style={{
              backgroundColor: swatch,
              outline: color === swatch ? '2px solid rgba(0,0,0,0.25)' : 'none',
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
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={isSaving}>
          {isSaving ? 'Saving' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

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
  const nameId = React.useId();
  const descriptionId = React.useId();

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
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label htmlFor={nameId} className="text-[12px] font-medium text-faint">
          Name
        </label>
        <Input
          id={nameId}
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
            if (event.key === 'Escape') onClose();
          }}
          placeholder="e.g. Distributed systems"
        />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={descriptionId} className="text-[12px] font-medium text-faint">
          Description <span className="text-faint/70">(optional)</span>
        </label>
        <Input
          id={descriptionId}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What lives on this shelf"
        />
      </div>

      <div className="grid gap-1.5">
        <p className="text-[12px] font-medium text-faint">Color</p>
        <div className="flex items-center gap-2.5 pt-0.5">
          {SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => setColor(swatch)}
              aria-label={`Use ${swatch}`}
              aria-pressed={color === swatch}
              className="focus-ring h-5 w-5 rounded-full transition-transform duration-[var(--dur-fast)] hover:scale-110"
              style={{
                backgroundColor: swatch,
                outline: color === swatch ? '2px solid var(--accent)' : 'none',
                outlineOffset: '2px',
              }}
            />
          ))}
        </div>
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

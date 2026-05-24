'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const SWATCHES = ['#0066cc', '#50e3c2', '#7928ca', '#16a34a', '#d97706', '#db2777', '#64748b'];

interface CreatedCollection {
  slug: string;
}

export function NewCollectionCard() {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [color, setColor] = React.useState(SWATCHES[0]);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const nameRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (isOpen) nameRef.current?.focus();
  }, [isOpen]);

  function reset() {
    setName('');
    setDescription('');
    setColor(SWATCHES[0]);
    setError(null);
  }

  function close() {
    setIsOpen(false);
    reset();
  }

  async function handleCreate() {
    if (isSaving) return;
    if (!name.trim()) {
      setError('Enter a name.');
      return;
    }

    setIsSaving(true);
    setError(null);

    const response = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, color }),
    });

    setIsSaving(false);

    if (!response.ok) {
      setError('Could not create the collection.');
      return;
    }

    const created = (await response.json()) as CreatedCollection;
    router.push(`/collections/${created.slug}`);
    router.refresh();
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="group flex h-full min-h-[7.5rem] w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-200 bg-transparent text-zinc-400 transition-colors hover:border-zinc-300 hover:text-zinc-600"
      >
        <Plus className="h-4 w-4" />
        <span className="text-xs font-medium">New collection</span>
      </button>
    );
  }

  return (
    <div className="h-full rounded-lg border-thin border-zinc-200/80 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-900">New collection</h3>
        <button
          type="button"
          onClick={close}
          className="text-zinc-400 transition-colors hover:text-zinc-700"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid gap-2.5">
        <Input
          ref={nameRef}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleCreate();
            if (event.key === 'Escape') close();
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
          <Button variant="secondary" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={isSaving}>
            {isSaving ? 'Creating' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
}

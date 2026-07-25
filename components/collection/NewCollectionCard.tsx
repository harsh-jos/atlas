'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { ConceptForm } from '@/components/collection/ConceptForm';
import { createConcept, type ConceptDraft } from '@/app/collections/actions';

export function NewCollectionCard() {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);

  async function create(draft: ConceptDraft) {
    const result = await createConcept(draft);
    if (result.error === undefined) router.push(`/collections/${result.value.slug}`);
    return result;
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Create a new collection"
        className="focus-ring group flex h-full min-h-[9.5rem] w-full flex-col items-center justify-center gap-3 rounded-card border border-dashed border-[var(--hairline-strong)] bg-transparent text-faint transition-colors duration-[var(--dur)] hover:border-accent/40 hover:bg-accent-soft/30 hover:text-accent"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-[13px] border-thin bg-surface text-faint shadow-raise transition-colors duration-[var(--dur)] group-hover:border-accent/30 group-hover:text-accent">
          <Plus className="h-4 w-4" />
        </span>
        <span className="text-[13px] font-medium">New collection</span>
      </button>
    );
  }

  return (
    <div className="animate-rise h-full rounded-card border-thin bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-[15px] font-bold text-ink">New collection</h3>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="focus-ring rounded-md p-1 text-faint transition-colors duration-[var(--dur-fast)] hover:bg-surface-soft hover:text-ink"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <ConceptForm submitLabel="Create" onSubmit={create} onClose={() => setIsOpen(false)} />
    </div>
  );
}

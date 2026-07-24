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
        className="group flex h-full min-h-[9.5rem] w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-[var(--hairline-strong)] bg-transparent text-faint transition-all duration-300 hover:border-accent/50 hover:bg-accent-soft/40 hover:text-accent"
      >
        <Plus className="h-4 w-4" />
        <span className="text-[13px] font-medium">New collection</span>
      </button>
    );
  }

  return (
    <div className="h-full rounded-card border-thin bg-surface p-5 shadow-card">
      <div className="mb-3.5 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink">New collection</h3>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-faint transition-colors hover:text-ink"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <ConceptForm submitLabel="Create" onSubmit={create} onClose={() => setIsOpen(false)} />
    </div>
  );
}

'use client';

import * as React from 'react';
import { Check, Eye, Link2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { NoteEditorCandidate, NoteWithLinks } from '@/lib/note-data';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';

export interface NoteInlineEditorProps {
  note: NoteWithLinks;
  candidates: NoteEditorCandidate[];
}

interface SavedNoteResponse {
  slug: string;
}

export function NoteInlineEditor({ note, candidates }: NoteInlineEditorProps) {
  const router = useRouter();
  const [title, setTitle] = React.useState(note.title);
  const [body, setBody] = React.useState(note.body ?? '');
  const [knowledgeLinksEnabled, setKnowledgeLinksEnabled] = React.useState(
    note.knowledgeLinksEnabled
  );
  const [linkedEntryIds, setLinkedEntryIds] = React.useState<string[]>(
    note.links.map((link) => link.entryId)
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save(destination: 'reader' | 'editor') {
    if (isSaving) return;

    setIsSaving(true);
    setError(null);
    const response = await fetch(`/api/notes/${note.slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body,
        knowledgeLinksEnabled,
        linkedEntryIds: knowledgeLinksEnabled ? linkedEntryIds : [],
      }),
    });

    setIsSaving(false);

    if (!response.ok) {
      setError('Could not save note.');
      return;
    }

    const saved = (await response.json()) as SavedNoteResponse;
    const path = destination === 'reader' ? `/notes/${saved.slug}` : `/notes/${saved.slug}?edit=true`;
    router.replace(path);
    router.refresh();
  }

  async function deleteNote() {
    if (isDeleting) return;
    if (!window.confirm(`Delete "${note.title}"? This cannot be undone.`)) return;

    setIsDeleting(true);
    setError(null);
    const response = await fetch(`/api/notes/${note.slug}`, { method: 'DELETE' });

    if (!response.ok) {
      setIsDeleting(false);
      setError('Could not delete note.');
      return;
    }

    router.push('/notes');
    router.refresh();
  }

  function toggleEntry(entryId: string) {
    setLinkedEntryIds((current) =>
      current.includes(entryId)
        ? current.filter((id) => id !== entryId)
        : [...current, entryId]
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Badge variant="default">Personal note</Badge>
          <h1 className="mt-2 text-[24px] font-medium tracking-[-0.02em] text-ink">Edit note</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
            disabled={isDeleting}
            onClick={deleteNote}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isDeleting ? 'Deleting' : 'Delete'}
          </Button>
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => save('reader')}>
            <Eye className="h-3.5 w-3.5" />
            Done
          </Button>
          <Button size="sm" className="gap-1.5" disabled={isSaving} onClick={() => save('editor')}>
            <Check className="h-3.5 w-3.5" />
            {isSaving ? 'Saving' : 'Save'}
          </Button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border-thin border-red-200/70 bg-red-50/60 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-5">
        <label className="grid gap-2">
          <span className="text-[13px] font-medium text-muted">Title</span>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <label className="grid gap-2">
          <span className="text-[13px] font-medium text-muted">Body</span>
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="min-h-[360px] leading-7"
          />
        </label>

        <section className="rounded-2xl border-thin bg-surface p-4">
          <label className="mb-3 flex items-center gap-2">
            <input
              type="checkbox"
              checked={knowledgeLinksEnabled}
              onChange={(event) => setKnowledgeLinksEnabled(event.target.checked)}
              className="h-4 w-4 rounded border-thin"
            />
            <span className="text-sm text-body">
              Allow linking this personal note to knowledge-base entries
            </span>
          </label>

          {knowledgeLinksEnabled ? (
            <>
              <h2 className="mb-2 flex items-center gap-2 text-[14px] font-medium text-ink">
                <Link2 className="h-4 w-4" />
                Linked knowledge entries
              </h2>
              <div className="max-h-64 space-y-1.5 overflow-auto rounded-lg border-thin bg-canvas p-2">
                {candidates.map((entry) => {
                  const active = linkedEntryIds.includes(entry.id);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => toggleEntry(entry.id)}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                        active ? 'bg-accent-soft text-accent' : 'text-body hover:bg-black/[0.03]'
                      }`}
                    >
                      <span className="truncate">{entry.title}</span>
                      <span className="ml-2 text-[11px] text-faint">{entry.collection.name}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">
              Knowledge links are disabled for this note. It stays fully isolated.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

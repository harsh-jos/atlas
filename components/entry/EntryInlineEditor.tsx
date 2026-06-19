'use client';

import * as React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { AlertCircle, Check, Eye, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type {
  EntryArtifactData,
  EntryEditorCollection,
  EntryRelationCandidate,
} from '@/lib/entry-data';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import {
  EditableSource,
  EntrySourceEditor,
} from '@/components/entry/EntrySourceEditor';
import {
  EditableRelation,
  EntryRelationEditor,
} from '@/components/entry/EntryRelationEditor';

export interface EntryInlineEditorProps {
  entry: EntryArtifactData;
  collections: EntryEditorCollection[];
  relationCandidates: EntryRelationCandidate[];
}

interface SavedEntryResponse {
  slug: string;
}

export function EntryInlineEditor({
  entry,
  collections,
  relationCandidates,
}: EntryInlineEditorProps) {
  const router = useRouter();
  const [title, setTitle] = React.useState(entry.title);
  const [summary, setSummary] = React.useState(entry.summary ?? '');
  const [body, setBody] = React.useState(entry.body ?? '');
  const [tags, setTags] = React.useState(entry.tags.join(', '));
  const [collectionId, setCollectionId] = React.useState(entry.collectionId);
  const [sources, setSources] = React.useState<EditableSource[]>(() =>
    entry.sources.map((source) => ({
      id: source.id,
      sourceType: source.sourceType,
      title: source.title,
      author: source.author ?? '',
      url: source.url ?? '',
      ref: source.ref ?? '',
    }))
  );
  const [relations, setRelations] = React.useState<EditableRelation[]>(() =>
    entry.relationsFrom.map((relation) => ({
      id: relation.id,
      toId: relation.toId,
      relationType: relation.relationType,
      note: relation.note ?? '',
    }))
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const draft = React.useMemo(
    () => ({
      title,
      summary,
      body,
      tags: parseTags(tags),
      collectionId,
      sources,
      relations,
    }),
    [body, collectionId, relations, sources, summary, tags, title]
  );

  const initialDraft = React.useMemo(
    () => ({
      title: entry.title,
      summary: entry.summary ?? '',
      body: entry.body ?? '',
      tags: entry.tags,
      collectionId: entry.collectionId,
      sources: entry.sources.map((source) => ({
        id: source.id,
        sourceType: source.sourceType,
        title: source.title,
        author: source.author ?? '',
        url: source.url ?? '',
        ref: source.ref ?? '',
      })),
      relations: entry.relationsFrom.map((relation) => ({
        id: relation.id,
        toId: relation.toId,
        relationType: relation.relationType,
        note: relation.note ?? '',
      })),
    }),
    [
      entry.body,
      entry.collectionId,
      entry.relationsFrom,
      entry.sources,
      entry.summary,
      entry.tags,
      entry.title,
    ]
  );

  const isDirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveEntry('editor');
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  async function saveEntry(destination: 'editor' | 'reader') {
    if (isSaving) return;

    setIsSaving(true);
    setErrorMessage(null);
    const response = await fetch(`/api/entries/${entry.slug}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(draft),
    });

    setIsSaving(false);

    if (!response.ok) {
      setErrorMessage('Could not save this entry. Try again.');
      return;
    }

    const savedEntry = (await response.json()) as SavedEntryResponse;
    setLastSavedAt(new Date());
    const nextPath =
      destination === 'editor'
        ? `/entries/${savedEntry.slug}?edit=true`
        : `/entries/${savedEntry.slug}`;

    router.replace(nextPath);
    router.refresh();
  }

  async function deleteEntry() {
    if (isDeleting) return;
    const confirmed = window.confirm(
      `Delete “${entry.title}”? This also removes its sources and relations. This cannot be undone.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setErrorMessage(null);
    const response = await fetch(`/api/entries/${entry.slug}`, { method: 'DELETE' });

    if (!response.ok) {
      setIsDeleting(false);
      setErrorMessage('Could not delete this entry. Try again.');
      return;
    }

    router.push(`/collections/${entry.collection.slug}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-2">
            <span className="text-xs text-faint">{entry.collection.name}</span>
          </div>
          <h1 className="font-display text-[22px] font-bold tracking-[-0.025em] text-ink">Edit entry</h1>
          <p className="mt-1 text-xs text-faint">
            {isDirty
              ? 'Unsaved changes'
              : lastSavedAt
                ? `Saved ${lastSavedAt.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : 'No changes yet'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
            disabled={isDeleting}
            onClick={deleteEntry}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isDeleting ? 'Deleting' : 'Delete'}
          </Button>
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => saveEntry('reader')}>
            <Eye className="h-3.5 w-3.5" />
            Done
          </Button>
          <Button size="sm" className="gap-1.5" disabled={isSaving} onClick={() => saveEntry('editor')}>
            <Check className="h-3.5 w-3.5" />
            {isSaving ? 'Saving' : 'Save'}
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border-thin border-red-200/70 bg-red-50/60 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      <div className="grid gap-5">
        <label className="grid gap-2">
          <span className="text-[13px] font-medium text-muted">Title</span>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <div className="grid gap-5 sm:grid-cols-[1fr_180px]">
          <label className="grid gap-2">
            <span className="text-[13px] font-medium text-muted">Tags</span>
            <Input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="paper, concept, foundational"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-[13px] font-medium text-muted">Collection</span>
            <select
              value={collectionId}
              onChange={(event) => setCollectionId(event.target.value)}
              className="h-9 rounded-lg border-thin bg-surface px-3 text-sm text-ink focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/15"
            >
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="grid gap-2">
          <span className="text-[13px] font-medium text-muted">Summary</span>
          <Textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            className="min-h-28 leading-7"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-[13px] font-medium text-muted">Body</span>
          <div className="overflow-hidden rounded-xl border-thin bg-surface">
            <CodeMirror
              value={body}
              minHeight="520px"
              extensions={[markdown()]}
              basicSetup={{
                foldGutter: false,
                highlightActiveLine: false,
                highlightActiveLineGutter: false,
              }}
              onChange={setBody}
              className="text-sm"
            />
          </div>
        </label>

        <EntrySourceEditor sources={sources} onChange={setSources} />

        <EntryRelationEditor
          relations={relations}
          candidates={relationCandidates}
          onChange={setRelations}
        />
      </div>
    </div>
  );
}

function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

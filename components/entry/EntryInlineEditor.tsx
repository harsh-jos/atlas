'use client';

import * as React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { Check, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { EntryStatus } from '@prisma/client';
import type { EntryArtifactData, EntryEditorCollection } from '@/lib/entry-data';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';

export interface EntryInlineEditorProps {
  entry: EntryArtifactData;
  collections: EntryEditorCollection[];
}

interface SavedEntryResponse {
  slug: string;
}

export function EntryInlineEditor({ entry, collections }: EntryInlineEditorProps) {
  const router = useRouter();
  const [title, setTitle] = React.useState(entry.title);
  const [summary, setSummary] = React.useState(entry.summary ?? '');
  const [body, setBody] = React.useState(entry.body ?? '');
  const [tags, setTags] = React.useState(entry.tags.join(', '));
  const [status, setStatus] = React.useState<EntryStatus>(entry.status);
  const [collectionId, setCollectionId] = React.useState(entry.collectionId);
  const [isSaving, setIsSaving] = React.useState(false);

  async function saveEntry(destination: 'editor' | 'reader') {
    if (isSaving) return;

    setIsSaving(true);
    const response = await fetch(`/api/entries/${entry.slug}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        summary,
        body,
        tags: parseTags(tags),
        status,
        collectionId,
      }),
    });

    setIsSaving(false);

    if (!response.ok) {
      return;
    }

    const savedEntry = (await response.json()) as SavedEntryResponse;
    const nextPath =
      destination === 'editor'
        ? `/entries/${savedEntry.slug}?edit=true`
        : `/entries/${savedEntry.slug}`;

    router.replace(nextPath);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant={status === 'PUBLISHED' ? 'success' : 'secondary'}>
              {status === 'PUBLISHED' ? 'Published' : 'Draft'}
            </Badge>
            <span className="text-xs text-zinc-400">{entry.collection.name}</span>
          </div>
          <h1 className="text-lg font-medium text-zinc-900">Edit entry</h1>
        </div>

        <div className="flex items-center gap-2">
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

      <div className="grid gap-5">
        <label className="grid gap-2">
          <span className="text-xs font-medium text-zinc-500">Title</span>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <div className="grid gap-5 sm:grid-cols-[1fr_180px_180px]">
          <label className="grid gap-2">
            <span className="text-xs font-medium text-zinc-500">Tags</span>
            <Input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="paper, concept, foundational"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-medium text-zinc-500">Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as EntryStatus)}
              className="h-9 rounded-md border-thin border-zinc-200 bg-white px-3 text-sm text-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
            >
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-medium text-zinc-500">Collection</span>
            <select
              value={collectionId}
              onChange={(event) => setCollectionId(event.target.value)}
              className="h-9 rounded-md border-thin border-zinc-200 bg-white px-3 text-sm text-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
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
          <span className="text-xs font-medium text-zinc-500">Summary</span>
          <Textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            className="min-h-28 leading-7"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-medium text-zinc-500">Body</span>
          <div className="overflow-hidden rounded-lg border-thin border-zinc-200/80 bg-white">
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

'use client';

import * as React from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { AlertCircle, Check, Eye, Image as ImageIcon, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { deleteEntry, saveEntry, uploadAsset, type SourceDraft } from '@/app/entries/actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { EntrySourceEditor } from '@/components/entry/EntrySourceEditor';
import { EntryRelationEditor, type EditableRelation } from '@/components/entry/EntryRelationEditor';
import type { ArtifactDetail, ConceptSummary } from '@/lib/api-types';
import { cleanTitle } from '@/lib/utils';

export interface EntryInlineEditorProps {
  artifact: ArtifactDetail;
  concepts: ConceptSummary[];
}

interface EditorDraft {
  title: string;
  summary: string;
  body: string;
  bodyHtml: string;
  tags: string;
  conceptId: string;
  sources: SourceDraft[];
  relations: EditableRelation[];
}

function toDraft(artifact: ArtifactDetail): EditorDraft {
  return {
    title: artifact.title,
    summary: artifact.summary ?? '',
    body: artifact.body ?? '',
    bodyHtml: artifact.bodyHtml ?? '',
    tags: artifact.tags.join(', '),
    conceptId: artifact.concept.id,
    sources: artifact.sources.map((source) => ({
      sourceType: source.sourceType,
      title: source.title,
      author: source.author ?? '',
      url: source.url ?? '',
      ref: source.ref ?? '',
    })),
    relations: artifact.relationsFrom.map((relation) => ({
      toSlug: relation.artifact.slug,
      toTitle: cleanTitle(relation.artifact.title),
      toColor: relation.concept.color,
      relationType: relation.relationType,
      note: relation.note ?? '',
    })),
  };
}

function parseTags(value: string) {
  return Array.from(new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean)));
}

export function EntryInlineEditor({ artifact, concepts }: EntryInlineEditorProps) {
  const router = useRouter();
  const saved = React.useMemo(() => toDraft(artifact), [artifact]);

  const [title, setTitle] = React.useState(saved.title);
  const [summary, setSummary] = React.useState(saved.summary);
  const [body, setBody] = React.useState(saved.body);
  const [bodyHtml, setBodyHtml] = React.useState(saved.bodyHtml);
  const [tags, setTags] = React.useState(saved.tags);
  const [conceptId, setConceptId] = React.useState(saved.conceptId);
  const [sources, setSources] = React.useState(saved.sources);
  const [relations, setRelations] = React.useState(saved.relations);

  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const editorRef = React.useRef<ReactCodeMirrorRef>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const draft: EditorDraft = { title, summary, body, bodyHtml, tags, conceptId, sources, relations };
  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved);

  async function save(destination: 'editor' | 'reader') {
    if (isSaving) return;

    setIsSaving(true);
    setErrorMessage(null);
    const result = await saveEntry(artifact.slug, { ...draft, tags: parseTags(tags) });
    setIsSaving(false);

    if (result.error) {
      setErrorMessage(result.error);
      return;
    }

    setSavedAt(new Date());
    if (destination === 'reader') router.push(`/entries/${artifact.slug}`);
  }

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save('editor');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  async function remove() {
    if (isDeleting) return;
    const confirmed = window.confirm(
      `Delete “${cleanTitle(artifact.title)}”? This also removes its sources and relations. This cannot be undone.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setErrorMessage(null);
    const result = await deleteEntry(artifact.slug, artifact.concept.slug);

    if (result?.error) {
      setIsDeleting(false);
      setErrorMessage(result.error);
    }
  }

  function insertAtCursor(text: string) {
    const view = editorRef.current?.view;
    if (!view) {
      setBody((current) => current + text);
      return;
    }
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    });
    view.focus();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    setUploadError(null);
    setIsUploading(true);
    const form = new FormData();
    form.append('file', file);
    const result = await uploadAsset(form);
    setIsUploading(false);

    if (result.error) {
      setUploadError(result.error);
      return;
    }
    insertAtCursor(`\n\n![${file.name}](${result.value})\n\n`);
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
            {artifact.concept.name}
          </p>
          <h1 className="text-[24px] font-semibold tracking-[-0.025em] text-ink">
            Edit entry
          </h1>
          <p className="mt-1.5 text-xs text-faint">
            {isDirty
              ? 'Unsaved changes'
              : savedAt
                ? `Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'No changes yet'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-danger hover:bg-danger-soft hover:text-danger"
            disabled={isDeleting}
            onClick={remove}
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

      {errorMessage && (
        <div className="mb-5 flex items-center gap-2 rounded-field border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
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
              value={conceptId}
              onChange={(event) => setConceptId(event.target.value)}
              className="focus-ring h-9 rounded-field border bg-surface px-3 text-sm text-ink transition-colors hover:border-hairline-strong"
            >
              {concepts.map((concept) => (
                <option key={concept.id} value={concept.id}>
                  {concept.name}
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

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-muted">Body</span>
            <div className="flex items-center gap-2">
              {uploadError && <span className="text-[12px] text-danger">{uploadError}</span>}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                {isUploading ? 'Uploading…' : 'Add image'}
              </Button>
            </div>
          </div>
          <div className="overflow-hidden rounded-card border bg-surface">
            <CodeMirror
              ref={editorRef}
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
        </div>

        <details className="rounded-card border bg-surface/60">
          <summary className="focus-ring cursor-pointer list-none rounded-card px-4 py-3 text-[13px] font-medium text-muted transition-colors hover:text-ink">
            HTML body{' '}
            <span className="text-faint">— optional; replaces the markdown body when set</span>
          </summary>
          <div className="border-t p-3">
            <div className="overflow-hidden rounded-field border bg-surface">
              <CodeMirror
                value={bodyHtml}
                minHeight="240px"
                extensions={[html()]}
                basicSetup={{
                  foldGutter: false,
                  highlightActiveLine: false,
                  highlightActiveLineGutter: false,
                }}
                onChange={setBodyHtml}
                className="text-sm"
              />
            </div>
          </div>
        </details>

        <EntrySourceEditor sources={sources} onChange={setSources} />

        <EntryRelationEditor
          relations={relations}
          excludeSlug={artifact.slug}
          onChange={setRelations}
        />
      </div>
    </div>
  );
}

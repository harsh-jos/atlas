import Link from 'next/link';
import { Pencil } from 'lucide-react';
import type { NoteWithLinks } from '@/lib/note-data';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { MarkdownBody } from '@/components/entry/MarkdownBody';
import { formatDate } from '@/lib/utils';

export interface NoteArtifactProps {
  note: NoteWithLinks;
}

export function NoteArtifact({ note }: NoteArtifactProps) {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <Breadcrumb
        className="mb-6"
        items={[
          { label: 'Home', href: '/' },
          { label: 'Personal notes', href: '/notes' },
          { label: note.title },
        ]}
      />

      <article className="mx-auto max-w-[74ch]">
        <header className="mb-6 border-b-thin pb-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="default">Personal note</Badge>
              <Badge variant={note.knowledgeLinksEnabled ? 'accent' : 'secondary'}>
                {note.knowledgeLinksEnabled ? 'KB links on' : 'KB links off'}
              </Badge>
            </div>
            <Link href={`/notes/${note.slug}?edit=true`}>
              <Button variant="secondary" size="sm" className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </Link>
          </div>

          <h1 className="text-[34px] font-medium leading-[1.15] tracking-[-0.02em] text-ink">
            {note.title}
          </h1>
          <p className="mt-3 text-xs text-muted">
            Updated {formatDate(note.updatedAt)} · {note._count.links}{' '}
            {note._count.links === 1 ? 'knowledge link' : 'knowledge links'}
          </p>
        </header>

        <MarkdownBody body={note.body} />

        <section className="mt-10 rounded-2xl border-thin bg-surface p-5">
          <h2 className="mb-3 text-[15px] font-medium text-ink">Knowledge links</h2>
          {note.links.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {note.links.map((link) => (
                <Link
                  key={link.id}
                  href={`/entries/${link.entry.slug}`}
                  className="rounded-full border-thin bg-canvas px-3 py-1 text-[13px] text-body transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
                >
                  {link.entry.title}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No knowledge links yet.</p>
          )}
        </section>
      </article>
    </div>
  );
}

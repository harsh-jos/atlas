import { ImportPanel } from '@/components/import/ImportPanel';

export const dynamic = 'force-dynamic';

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:px-8">
      <header className="mb-8">
        <h1 className="font-display text-[34px] font-bold leading-[1.1] tracking-[-0.03em] text-ink">
          Import
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-muted">
          Bring outside knowledge into your library — a documentation site, an article, a PDF, or
          markdown. It’s split into linked entries you can read and explore.
        </p>
      </header>

      <ImportPanel />
    </div>
  );
}

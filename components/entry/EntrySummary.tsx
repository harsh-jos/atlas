export interface EntrySummaryProps {
  summary: string | null;
}

export function EntrySummary({ summary }: EntrySummaryProps) {
  return (
    <section className="rounded-lg border-thin border-zinc-200/70 bg-zinc-50/70 p-4">
      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-normal text-zinc-400">
        Summary
      </h2>
      <p className="text-sm leading-7 text-zinc-700">
        {summary?.trim() || 'No summary has been written yet.'}
      </p>
    </section>
  );
}

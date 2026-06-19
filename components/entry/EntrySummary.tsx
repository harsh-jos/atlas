export interface EntrySummaryProps {
  summary: string | null;
}

export function EntrySummary({ summary }: EntrySummaryProps) {
  return (
    <section className="rounded-[12px] border-thin bg-surface-soft p-5">
      <h2 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
        Summary
      </h2>
      <p className="text-[18px] leading-[1.6] text-ink">
        {summary?.trim() || 'No summary has been written yet.'}
      </p>
    </section>
  );
}

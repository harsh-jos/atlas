export interface EntrySummaryProps {
  summary: string | null;
}

/**
 * The summary as an editorial lead/deck — a calm standfirst between the title
 * and the body, set slightly larger and quieter than the reading text.
 */
export function EntrySummary({ summary }: EntrySummaryProps) {
  const text = summary?.trim();
  if (!text) return null;

  return (
    <p className="border-l-2 border-hairline-strong pl-4 text-[18px] leading-[1.65] text-muted">
      {text}
    </p>
  );
}

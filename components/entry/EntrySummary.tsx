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

  return <p className="text-[20px] leading-[1.55] text-muted">{text}</p>;
}

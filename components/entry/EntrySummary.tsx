export interface EntrySummaryProps {
  summary: string | null;
}

/**
 * The summary as an editorial lead/deck — a calm standfirst between the title
 * and the body, set apart with the sky accent rule so it reads as the piece's
 * opening line rather than UI metadata.
 */
export function EntrySummary({ summary }: EntrySummaryProps) {
  const text = summary?.trim();
  if (!text) return null;

  return (
    <p className="border-l-2 border-sky pl-[18px] text-[18px] font-medium leading-[1.6] text-ink/85">
      {text}
    </p>
  );
}

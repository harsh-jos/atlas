export interface EntryCoverBandProps {
  color: string | null;
}
export function EntryCoverBand({ color }: EntryCoverBandProps) {
  return (
    <div
      aria-hidden="true"
      className="relative h-20 overflow-hidden border-b bg-accent-soft/70 sm:h-24"
    >
      <div className="absolute -right-10 -top-24 size-72 rounded-full border-[30px] border-sky/15" />
      <div
        className="absolute left-12 top-8 h-px w-20 bg-accent-line"
        style={{ backgroundColor: color || undefined, opacity: 0.4 }}
      />
    </div>
  );
}

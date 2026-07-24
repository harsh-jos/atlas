export interface CollectionDetailHeaderProps {
  name: string;
  description: string | null;
  color: string | null;
  entryCount: number;
}

export function CollectionDetailHeader({
  name,
  description,
  color,
  entryCount,
}: CollectionDetailHeaderProps) {
  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center gap-3">
        <span
          className="inline-block h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: color || 'var(--faint)' }}
        />
        <h1 className="font-title text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-ink">
          {name}
        </h1>
      </div>
      {description && (
        <p className="ml-6 mb-2 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>
      )}
      <p className="ml-6 text-[13px] text-faint">
        {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
      </p>
    </div>
  );
}

export interface EntryTagsProps {
  tags: string[];
}

/** One dense line in the footer, matching Sources/Related's label-then-list rhythm. */
export function EntryTags({ tags }: EntryTagsProps) {
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[13px] leading-6">
      <span className="shrink-0 font-sans text-xs font-medium text-faint">
        Tagged
      </span>
      <span className="text-xs text-muted">{tags.join(' · ')}</span>
    </div>
  );
}

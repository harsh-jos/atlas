import { SectionLabel } from '@/components/entry/SectionLabel';

export interface EntryTagsProps {
  tags: string[];
}

export function EntryTags({ tags }: EntryTagsProps) {
  if (tags.length === 0) return null;

  return (
    <section>
      <SectionLabel>Tagged</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border bg-surface px-2.5 py-0.5 text-[12px] text-muted"
          >
            {tag}
          </span>
        ))}
      </div>
    </section>
  );
}

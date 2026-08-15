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
            className="rounded-full bg-surface-soft px-2.5 py-1 font-mono text-[11.5px] text-muted"
          >
            {tag}
          </span>
        ))}
      </div>
    </section>
  );
}

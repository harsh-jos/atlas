import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cleanTitle } from '@/lib/utils';

export interface LineageNode {
  title: string;
  slug: string;
}

export interface EntryLineageProps {
  /** Artifacts this one names as a PREREQUISITE — read these first. */
  prerequisites: LineageNode[];
  /** Artifacts that name this one as their PREREQUISITE — read these next. */
  enables: LineageNode[];
}

/**
 * Where this artifact sits in the graph, not just which concept it's filed
 * under — PREREQUISITE is the one relation type that's genuinely sequential,
 * so it's the only one promoted up here; everything else (USES, CONTRASTS,
 * SEE_ALSO, PART_OF) stays associative and lives in the Related footer.
 */
export function EntryLineage({ prerequisites, enables }: EntryLineageProps) {
  if (prerequisites.length === 0 && enables.length === 0) return null;

  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-1 gap-y-2">
      {prerequisites.length > 0 && (
        <>
          <NodeCluster nodes={prerequisites} />
          <Edge label="Prerequisite" />
        </>
      )}

      <span className="shrink-0 rounded-lg bg-action px-3 py-1.5 text-[12.5px] font-medium text-white">
        This artifact
      </span>

      {enables.length > 0 && (
        <>
          <Edge label="Required for" />
          <NodeCluster nodes={enables} />
        </>
      )}
    </div>
  );
}

function NodeCluster({ nodes }: { nodes: LineageNode[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {nodes.map((node) => (
        <Link
          key={node.slug}
          href={`/entries/${node.slug}`}
          className="focus-ring max-w-[13rem] truncate rounded-lg border bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink transition-colors duration-[var(--dur-fast)] hover:border-accent-line hover:bg-accent-soft hover:text-accent"
        >
          {cleanTitle(node.title)}
        </Link>
      ))}
    </div>
  );
}

function Edge({ label }: { label: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center px-1.5">
      <ChevronRight className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
      <span className="text-[10px] text-faint">{label}</span>
    </div>
  );
}

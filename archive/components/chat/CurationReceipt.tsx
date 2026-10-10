import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';

export interface ReceiptConcept {
  slug: string;
  name: string;
  artifacts: number;
}

export interface ReceiptData {
  concepts: ReceiptConcept[];
  sourcesReviewed: number;
  sourcesDiscarded: number;
  links: number;
}

/** What a resolved review batch leaves behind in the chat feed — a receipt, not more prose. */
export function CurationReceipt({ receipt }: { receipt: ReceiptData }) {
  if (receipt.concepts.length === 0) {
    return (
      <div className="animate-rise flex items-center gap-2.5 rounded-card border bg-surface px-4 py-2.5 shadow-card">
        <Badge variant="secondary">Discarded</Badge>
        <p className="text-[13.5px] text-muted">
          Nothing kept from {receipt.sourcesReviewed} source{receipt.sourcesReviewed === 1 ? '' : 's'}.
        </p>
      </div>
    );
  }

  const totalKept = receipt.concepts.reduce((sum, concept) => sum + concept.artifacts, 0);

  return (
    <div className="animate-rise overflow-hidden rounded-card border bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
        <Badge variant="success">Kept</Badge>
        <p className="text-[13.5px] text-ink">
          {totalKept} artifact{totalKept === 1 ? '' : 's'} across {receipt.concepts.length} concept
          {receipt.concepts.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-t px-4 py-2.5">
        {receipt.concepts.map((concept) => (
          <Link
            key={concept.slug}
            href={`/collections/${concept.slug}`}
            className="focus-ring inline-flex items-center gap-1.5 rounded-full border bg-surface-soft px-2.5 py-1 text-[12.5px] text-ink transition-colors hover:border-accent-line hover:text-accent"
          >
            {concept.name}
            <span className="text-faint">{concept.artifacts}</span>
          </Link>
        ))}
      </div>

      {receipt.links > 0 && (
        <p className="border-t px-4 py-2 text-[12px] text-faint">
          Found {receipt.links} new connection{receipt.links === 1 ? '' : 's'} in the{' '}
          <Link href="/graph" className="focus-ring rounded-[4px] text-muted hover:text-ink">
            graph
          </Link>
          .
        </p>
      )}

      {receipt.sourcesDiscarded > 0 && (
        <p className="border-t px-4 py-2 text-[12px] text-faint">
          {receipt.sourcesDiscarded} other source{receipt.sourcesDiscarded === 1 ? '' : 's'} discarded.
        </p>
      )}
    </div>
  );
}

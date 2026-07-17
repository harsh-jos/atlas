import type { ReactNode } from 'react';

/**
 * The quiet mono micro-label that heads each back-matter section (Sources,
 * Related, Tagged, Details) — a book's apparatus, not a loud heading.
 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">{children}</h2>
  );
}

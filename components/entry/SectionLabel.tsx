import type { ReactNode } from 'react';

/**
 * The quiet section label that heads each back-matter section (Sources,
 * Related, Tagged, Details) — a book's apparatus, not a loud heading. The
 * trailing hairline reads as a chapter-divider rule, not a form label.
 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="shrink-0 font-sans text-xs font-medium text-faint">
        {children}
      </h2>
      <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
    </div>
  );
}

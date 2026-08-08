import type * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  /** Optional call to action — rendered as a link-styled button. */
  action?: { label: string; href: string };
}

/**
 * Refined empty state — a dotted well, one sentence, one action.
 * No large illustrations, per the design language.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="relative overflow-hidden rounded-card border bg-canvas px-6 py-16 text-center">
      <div
        className="dot-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(240px_140px_at_50%_38%,black,transparent)]"
        aria-hidden="true"
      />
      <div className="relative flex flex-col items-center">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[10px] border bg-surface text-faint shadow-card">
          {icon}
        </div>
        <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</p>
        {description && (
          <p className="mt-1.5 max-w-sm text-[13px] leading-6 text-muted">{description}</p>
        )}
        {action && (
          <Link href={action.href} className="mt-5">
            <Button variant="secondary" size="sm">
              {action.label}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

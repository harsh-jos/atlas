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
 * Refined empty state — a halftone ground, one sentence, one action.
 * No large illustrations, per the design language.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="relative overflow-hidden rounded-card border-thin bg-surface px-6 py-16 text-center">
      <div
        className="dot-grid pointer-events-none absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(240px_140px_at_50%_38%,black,transparent)]"
        aria-hidden="true"
      />
      <div className="relative flex flex-col items-center">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[13px] border-thin bg-surface text-faint shadow-raise">
          {icon}
        </div>
        <p className="font-title text-[17px] font-bold tracking-[-0.02em] text-ink">{title}</p>
        {description && (
          <p className="mt-2 max-w-sm text-[13.5px] leading-6 text-muted">{description}</p>
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

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
 * Clean, minimal empty state — a short sentence and (optionally) one action.
 * No large illustrations, per the design language.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-[12px] border-thin bg-surface px-6 py-14 text-center shadow-card">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface-soft text-faint">
        {icon}
      </div>
      <p className="font-display text-[15px] font-bold text-ink">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-[13px] leading-6 text-muted">{description}</p>
      )}
      {action && (
        <Link href={action.href} className="mt-4">
          <Button variant="secondary" size="sm">
            {action.label}
          </Button>
        </Link>
      )}
    </div>
  );
}

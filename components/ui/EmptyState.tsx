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
    <div className="flex flex-col items-center rounded-lg border-thin border-zinc-200/80 bg-zinc-50/40 px-6 py-12 text-center">
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md border-thin border-zinc-200/80 bg-white text-zinc-400">
        {icon}
      </div>
      <p className="text-sm font-medium text-zinc-700">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-6 text-zinc-500">{description}</p>
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

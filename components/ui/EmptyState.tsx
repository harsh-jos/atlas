import type * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/shadcn/button';
export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; href: string };
}
export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-canvas/50 px-5 py-10 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl border border-accent-line/70 bg-accent-soft text-accent">
        {icon}
      </div>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
          {description}
        </p>
      )}
      {action && (
        <Button asChild className="mt-4">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}

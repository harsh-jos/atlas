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
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-canvas/50 px-6 py-16 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-accent-line/70 bg-accent-soft text-accent">
        {icon}
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
          {description}
        </p>
      )}
      {action && (
        <Button asChild className="mt-6">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
